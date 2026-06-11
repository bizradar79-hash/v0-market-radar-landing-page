export const dynamic = 'force-dynamic'
export const maxDuration = 300 // Vercel Pro — long-running sync

import { NextResponse, after } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@/lib/supabase/server'
import { captureSnapshot } from '@/lib/scan/snapshot'
import {
  initScanControl, assertScanAlive, recordScanCall, setModuleStatus,
  finishScan, ScanAbortError, type ScanProfile, type ModuleStatus as BreakerModuleStatus,
} from '@/lib/scan/breaker'
import { headers } from 'next/headers'

const SYNC_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
// Hard backstop BELOW Vercel's 300s function limit so the background worker
// aborts itself (and persists state) before the platform kills the invocation.
const SYNC_TIMEOUT_MS = 280 * 1000
// TIME fix — soft chaining deadline. When one invocation has been running this
// long, it stops at the next module boundary, persists progress, and AUTOMATICALLY
// re-invokes itself (resume:true) to finish the remaining modules in a fresh
// window. This makes the scan resumable across invocations instead of dying with
// 'aborted_timeout'. Kept well under SCAN_MAX_SECONDS / Vercel's limit so a single
// in-flight module can still finish before the hard caps bite.
const SYNC_CHAIN_AFTER_MS = Math.max(
  30_000,
  parseInt(process.env.SCAN_CHAIN_AFTER_MS || '170000', 10) || 170_000,
)
// Safety: never chain more than this many times for one scan (prevents loops).
const SYNC_MAX_CHAINS = Math.max(1, parseInt(process.env.SCAN_MAX_CHAINS || '6', 10) || 6)

/** Internal sentinel: unwind the run to chain into a fresh invocation. */
class ScanChainSignal extends Error {
  constructor() { super('scan chain'); this.name = 'ScanChainSignal' }
}

function getAdminSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

type ModuleStatus = 'ok' | 'skipped' | 'error'
interface LogEntry { module: string; status: ModuleStatus; message: string; updated_at: string }

async function callModule(
  origin: string,
  path: string,
  companyId: string,
  force = true,
): Promise<{ ok: boolean; status: number; body?: any }> {
  const sep = path.includes('?') ? '&' : '?'
  const url = `${origin}${path}${force ? `${sep}force=true` : ''}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-user-id': companyId,
        'x-admin-secret': process.env.SUPABASE_SERVICE_ROLE_KEY!,
      },
      body: JSON.stringify({}),
    })
    let body: any
    try { body = await res.json() } catch { body = {} }
    return { ok: res.ok, status: res.status, body }
  } catch (e: any) {
    return { ok: false, status: 0, body: { error: e?.message } }
  }
}

export async function POST(request: Request) {
  const reqHeaders = await headers()
  const cronSecret = reqHeaders.get('x-cron-secret')
  const isCron = cronSecret === process.env.CRON_SECRET

  const origin = new URL(request.url).origin

  // Auth: cron, admin secret header, or logged-in admin
  let callerIsAdmin = isCron
  let adminDb = getAdminSupabase()

  if (!callerIsAdmin) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: role } = await supabase.from('user_roles').select('is_admin').eq('user_id', user.id).single()
      callerIsAdmin = !!role?.is_admin
    }
  }

  if (!callerIsAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const companyId: string | undefined = body.company_id
  const force: boolean = body.force === true
  // Self-chained continuation (TIME fix): set by this route when it re-invokes
  // itself to finish remaining modules in a fresh window.
  const resume: boolean = body.resume === true
  const chainIndex: number = Number.isFinite(body.chain_index) ? body.chain_index : 0
  // Scan profile: 'initial' (rich, onboarding-grade) vs 'weekly' (lean refresh).
  // sync/run is the recurring path, so default to the lean weekly profile.
  const profile: 'initial' | 'weekly' = body.profile === 'initial' ? 'initial' : 'weekly'
  const isWeekly = profile === 'weekly'
  const COMPETITOR_TARGET = 7

  if (!companyId) {
    return NextResponse.json({ error: 'Missing company_id' }, { status: 400 })
  }

  const { data: company } = await adminDb
    .from('companies')
    .select('id, sync_status, last_sync_at, next_sync_at, keywords')
    .eq('id', companyId)
    .single()

  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  // FIX 4 — weekly is LEAN: these modules are skipped entirely (no AI call).
  // Weekly runs only the dynamic data modules + cheap synthesis.
  const WEEKLY_SKIP = new Set<string>([
    'competitors',          // competitor DISCOVERY (expensive)
    'competitor_ratings',   // Google Places sweep
    'review_analysis',      // analyze-company-reviews (the runaway)
    'leads',                // lead generation
    'niche_opportunities',  // niche AI generation
  ])
  const isSkipped = (moduleId: string) => isWeekly && WEEKLY_SKIP.has(moduleId)

  // Ordered module ids for the progress modal / circuit-breaker state.
  const MODULE_IDS = [
    'competitors', 'competitor_ratings', 'review_analysis',
    'seo_ranking', 'geo_ranking', 'industry_trends', 'keyword_trends',
    'competitor_trends', 'news', 'tenders', 'leads', 'weekly_actions',
    'niche_opportunities', 'weekly_report',
  ]

  // FIX 3 — initialise the circuit breaker. This also guards against a second
  // invocation (504 retry) stacking a duplicate run while one is still fresh.
  // FIX 1 — the returned control carries over modules already completed by a
  // prior STALE run so we can resume (skip them) instead of redoing the scan.
  let initialControl
  try {
    initialControl = await initScanControl(adminDb, companyId, profile as ScanProfile, MODULE_IDS, { force, resume })
  } catch (e) {
    if (e instanceof ScanAbortError && e.reason === 'already_running') {
      return NextResponse.json({ message: 'Scan already running', scan_status: 'running' }, { status: 409 })
    }
    throw e
  }

  // Modules already finished by a prior (resumed) run — skip without re-calling.
  const resumeDone = new Set<string>(
    MODULE_IDS.filter(id => {
      const st = initialControl.modules?.[id]?.status
      return st === 'done' || st === 'skipped'
    }),
  )

  // Pre-mark weekly-skipped modules so the modal shows them as skipped up front.
  for (const id of MODULE_IDS) {
    if (isSkipped(id)) await setModuleStatus(adminDb, companyId, id, 'skipped', 'weekly: lean scan')
  }

  // Layer 2: capture a full pre-scan snapshot before anything mutates state —
  // only on the FIRST window (a chained continuation must not re-snapshot or
  // wipe the accumulated sync_log).
  if (!resume) {
    await captureSnapshot(adminDb, companyId, 'full')
    await adminDb.from('companies').update({
      sync_status: 'running',
      last_sync_at: new Date().toISOString(),
      sync_log: [],
    }).eq('id', companyId)
  }

  const log: LogEntry[] = []
  const ts = () => new Date().toISOString()
  // TIME fix — wall-clock anchor for THIS invocation. When it exceeds
  // SYNC_CHAIN_AFTER_MS at a module boundary we stop and chain into a fresh one.
  const invocationStart = Date.now()

  function addLog(module: string, status: ModuleStatus, message: string) {
    log.push({ module, status, message, updated_at: ts() })
  }

  // Map the log status vocabulary → breaker module-status vocabulary.
  const mapStatus = (s: ModuleStatus): BreakerModuleStatus => (s === 'ok' ? 'done' : s)

  // ── Guarded step wrapper ──────────────────────────────────────────────────
  // Every module runs through here so the circuit breaker can stop/timeout/cap
  // the scan, and so per-module progress is persisted for the modal (FIX 5).
  async function runStep(
    moduleId: string,
    fn: () => Promise<{ status: ModuleStatus; message: string }>,
  ) {
    // FIX 4 — weekly skips stable/expensive modules entirely (no AI call).
    if (isSkipped(moduleId)) {
      addLog(moduleId, 'skipped', 'weekly: lean scan')
      await setModuleStatus(adminDb, companyId!, moduleId, 'skipped', 'weekly: lean scan')
      return
    }
    // FIX 1 — resume: a prior stale run already completed this module. Skip it
    // (no AI call, no recount) so a restarted scan finishes the remainder.
    if (resumeDone.has(moduleId)) {
      addLog(moduleId, 'skipped', 'resumed: already complete')
      return
    }
    // TIME fix — soft chaining deadline. If THIS invocation has been running long
    // enough, stop at this module boundary (progress for finished modules is
    // already persisted in scan_control) and let the outer handler re-invoke us
    // with resume:true to finish the rest in a fresh window. We only chain while
    // we still have chain budget; once exhausted we fall through and rely on the
    // circuit breaker's hard wall-clock cap instead of looping forever.
    if (chainIndex < SYNC_MAX_CHAINS && Date.now() - invocationStart > SYNC_CHAIN_AFTER_MS) {
      throw new ScanChainSignal()
    }
    // FIX 3 — stop button / wall-clock timeout. Throws ScanAbortError to unwind.
    await assertScanAlive(adminDb, companyId!)
    await setModuleStatus(adminDb, companyId!, moduleId, 'running')

    let outcome: { status: ModuleStatus; message: string }
    try {
      outcome = await fn()
    } catch (e) {
      if (e instanceof ScanAbortError) throw e
      outcome = { status: 'error', message: (e as any)?.message ?? 'error' }
    }

    // FIX 3 — count one external-AI-call unit (only when we actually called out)
    // and enforce SCAN_MAX_CALLS. Throws ScanAbortError('aborted_call_cap').
    if (outcome.status !== 'skipped') {
      await recordScanCall(adminDb, companyId!)
    }
    addLog(moduleId, outcome.status, outcome.message)
    await setModuleStatus(adminDb, companyId!, moduleId, mapStatus(outcome.status), outcome.message)
    // Small breather to avoid hammering Groq's TPM limit. Trimmed from 1200ms →
    // 500ms (TIME fix) so 14 sequential modules don't burn ~17s on sleeps alone.
    await new Promise(res => setTimeout(res, 500))
  }

  // ── Inner function with all module calls ──────────────────────────────────
  async function runAllModules() {
    // 1. Competitor DISCOVERY — initial only (weekly skips it per FIX 4).
    await runStep('competitors', async () => {
      const { count: autoCount } = await adminDb
        .from('competitors')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .neq('source', 'manual')
      if ((autoCount ?? 0) >= COMPETITOR_TARGET) {
        return { status: 'skipped', message: `already have ${autoCount} auto competitors` }
      }
      const r = await callModule(origin, '/api/find-competitors', companyId!, false)
      return {
        status: r.ok ? 'ok' : 'error',
        message: r.ok ? `found ${r.body?.count ?? 0}` : (r.body?.error ?? `HTTP ${r.status}`),
      }
    })

    // 1b. Competitor ratings (Google Places) — initial only.
    await runStep('competitor_ratings', async () => {
      const r = await callModule(origin, '/api/sync-competitor-ratings', companyId!)
      return {
        status: r.ok ? 'ok' : 'error',
        message: r.ok ? `${r.body?.updated ?? 0} updated` : (r.body?.error ?? `HTTP ${r.status}`),
      }
    })

    // 1c. Company Google review analysis — initial only, and WITHOUT force so the
    // route's 7-day cache applies (FIX 2: at most once per cache window, no runaway).
    await runStep('review_analysis', async () => {
      const r = await callModule(origin, '/api/analyze-company-reviews', companyId!, false)
      const msg = r.ok
        ? (r.body?.cached ? 'cached' : (r.body?.google_rating != null ? `rating=${r.body.google_rating}` : 'no rating found'))
        : (r.body?.error ?? `HTTP ${r.status}`)
      return { status: r.ok ? 'ok' : 'error', message: msg }
    })

    // 2. SEO ranking
    await runStep('seo_ranking', async () => {
      const r = await callModule(origin, '/api/generate-seo-ranking', companyId!)
      return { status: r.ok ? 'ok' : 'error', message: r.ok ? 'refreshed' : (r.body?.error ?? `HTTP ${r.status}`) }
    })

    // 3. GEO ranking
    await runStep('geo_ranking', async () => {
      const r = await callModule(origin, '/api/generate-geo-ranking', companyId!)
      return { status: r.ok ? 'ok' : 'error', message: r.ok ? 'refreshed' : (r.body?.error ?? `HTTP ${r.status}`) }
    })

    // 4. Industry trends
    await runStep('industry_trends', async () => {
      const r = await callModule(origin, '/api/industry-trends', companyId!)
      return { status: r.ok ? 'ok' : 'error', message: r.ok ? `${r.body?.trends?.length ?? 0} trends` : (r.body?.error ?? `HTTP ${r.status}`) }
    })

    // 4b. Keyword trends — TIME fix: the 5 keyword fetches are independent, so run
    // them CONCURRENTLY instead of one-by-one (cuts this module's wall-time ~5x).
    // We honour the stop signal ONCE before firing the batch; the breaker's call
    // counter still records this as a single module unit (one runStep).
    await runStep('keyword_trends', async () => {
      const keywords: string[] = ((company as any).keywords || []).slice(0, 5)
      if (keywords.length === 0) return { status: 'skipped', message: '0 keywords' }
      const adminHeaders = {
        'Content-Type': 'application/json',
        'x-admin-user-id': companyId!,
        'x-admin-secret': process.env.SUPABASE_SERVICE_ROLE_KEY!,
      }
      await assertScanAlive(adminDb, companyId!) // honour stop before the batch
      const results = await Promise.all(keywords.map(async (keyword) => {
        try {
          const res = await fetch(`${origin}/api/generate-keyword-trends?force=true`, {
            method: 'POST', headers: adminHeaders, body: JSON.stringify({ keyword, force: true }),
          })
          if (res.ok) { await res.json().catch(() => ({})); return { ok: true as const } }
          const errText = await res.text().catch(() => '')
          return { ok: false as const, err: `"${keyword}": HTTP ${res.status} — ${errText.slice(0, 80)}` }
        } catch (e: any) {
          return { ok: false as const, err: `"${keyword}": ${e?.message}` }
        }
      }))
      const kwUpdated = results.filter(r => r.ok).length
      const kwErrors = results.filter(r => !r.ok).map(r => (r as any).err as string)
      return {
        status: kwUpdated > 0 ? 'ok' : 'error',
        message: `${kwUpdated}/${keywords.length} keywords${kwErrors.length ? ` | ${kwErrors.slice(0, 2).join('; ')}` : ''}`,
      }
    })

    // 5. Competitor trends
    await runStep('competitor_trends', async () => {
      const r = await callModule(origin, '/api/competitor-trends', companyId!)
      return { status: r.ok ? 'ok' : 'error', message: r.ok ? `${r.body?.competitor_data?.length ?? 0} competitors` : (r.body?.error ?? `HTTP ${r.status}`) }
    })

    // 6. News
    await runStep('news', async () => {
      const r = await callModule(origin, '/api/generate-news', companyId!)
      return { status: r.ok ? 'ok' : 'error', message: r.ok ? `${r.body?.count ?? 0} articles` : (r.body?.error ?? `HTTP ${r.status}`) }
    })

    // 7. Tenders
    await runStep('tenders', async () => {
      const { count: existingTenders } = await adminDb
        .from('tenders').select('id', { count: 'exact', head: true }).eq('company_id', companyId)
      const r = await callModule(origin, '/api/find-tenders', companyId!)
      const newCount = r.body?.count ?? 0
      if (r.ok && newCount >= (existingTenders ?? 0)) return { status: 'ok', message: `${newCount} tenders` }
      if (r.ok) return { status: 'skipped', message: `new ${newCount} < existing ${existingTenders}` }
      return { status: 'error', message: r.body?.error ?? `HTTP ${r.status}` }
    })

    // 8. Leads — initial only (weekly skips), and only when below threshold.
    await runStep('leads', async () => {
      const { count: leadsCount } = await adminDb
        .from('leads').select('id', { count: 'exact', head: true }).eq('company_id', companyId)
      if ((leadsCount ?? 0) >= 5) return { status: 'skipped', message: `already have ${leadsCount} leads` }
      const r = await callModule(origin, '/api/generate-leads', companyId!)
      return { status: r.ok ? 'ok' : 'error', message: r.ok ? `${r.body?.count ?? 0} leads` : (r.body?.error ?? `HTTP ${r.status}`) }
    })

    // 9. Weekly actions
    await runStep('weekly_actions', async () => {
      const r = await callModule(origin, '/api/generate-weekly-actions', companyId!)
      return { status: r.ok ? 'ok' : 'error', message: r.ok ? `${r.body?.actions?.length ?? 0} actions` : (r.body?.error ?? `HTTP ${r.status}`) }
    })

    // 10. Niche opportunities — initial only (weekly skips). Preserve user statuses.
    await runStep('niche_opportunities', async () => {
      const { data: prevCompany } = await adminDb
        .from('companies').select('niche_opportunities').eq('id', companyId).single()
      const prevNiches: any[] = (prevCompany?.niche_opportunities as any)?.opportunities ?? []
      const preservedStatuses = new Map<string, string>()
      for (const n of prevNiches) {
        if (n.status && n.status !== 'new' && n.nicheTitle) {
          preservedStatuses.set(n.nicheTitle.toLowerCase().trim(), n.status)
        }
      }
      const r = await callModule(origin, '/api/generate-niche-opportunities', companyId!)
      if (r.ok && preservedStatuses.size > 0) {
        const { data: freshCompany } = await adminDb
          .from('companies').select('niche_opportunities').eq('id', companyId).single()
        const freshData = freshCompany?.niche_opportunities as any
        if (freshData?.opportunities?.length) {
          let changed = false
          const updated = freshData.opportunities.map((n: any) => {
            const key = (n.nicheTitle ?? '').toLowerCase().trim()
            const savedStatus = preservedStatuses.get(key)
            if (savedStatus && n.status !== savedStatus) { changed = true; return { ...n, status: savedStatus } }
            return n
          })
          if (changed) {
            await adminDb.from('companies').update({
              niche_opportunities: { ...freshData, opportunities: updated }
            } as any).eq('id', companyId)
          }
        }
      }
      return { status: r.ok ? 'ok' : 'error', message: r.ok ? `${r.body?.opportunities?.length ?? 0} niches` : (r.body?.error ?? `HTTP ${r.status}`) }
    })

    // 11. Weekly report
    await runStep('weekly_report', async () => {
      const r = await callModule(origin, '/api/generate-weekly-report', companyId!)
      return { status: r.ok ? 'ok' : 'error', message: r.ok ? (r.body?.report?.generated_at ? `generated at ${r.body.report.generated_at}` : 'generated') : (r.body?.error ?? `HTTP ${r.status}`) }
    })
  }

  // ── Background execution (TIME fix) ───────────────────────────────────────
  // The scan is a background job, NOT a request the caller waits on. We schedule
  // it with after() so the HTTP response returns immediately (no client-side 504
  // / retry storm) while the worker keeps running up to Vercel's maxDuration.
  // When SYNC_CHAIN_AFTER_MS elapses at a module boundary the worker throws
  // ScanChainSignal, persists progress, and re-invokes THIS route with
  // resume:true so the remaining modules finish in a fresh window — the scan is
  // resumable across invocations instead of dying with 'aborted_timeout'.
  after(async () => {
    let finalStatus: 'done' | 'error' | 'stopped' | 'chained' = 'done'
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Sync timeout: exceeded scan window')), SYNC_TIMEOUT_MS)
      )

      await Promise.race([runAllModules(), timeoutPromise])

      finalStatus = 'done'
      await finishScan(adminDb, companyId!, 'done')
    } catch (e: any) {
      if (e instanceof ScanChainSignal) {
        // TIME fix — soft deadline hit. Leave scan_control 'running' (do NOT
        // finishScan) and chain into a fresh invocation to finish the rest.
        finalStatus = 'chained'
        addLog('sync', 'skipped', `chained → window ${chainIndex + 1}`)
        try {
          await fetch(`${origin}/api/sync/run`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-cron-secret': process.env.CRON_SECRET || '',
            },
            body: JSON.stringify({
              company_id: companyId,
              profile,
              resume: true,
              chain_index: chainIndex + 1,
            }),
          })
        } catch (chainErr: any) {
          console.error('[sync/run] chain re-invoke failed:', chainErr?.message)
          // If we couldn't hand off, don't leave the scan wedged 'running'.
          finalStatus = 'error'
          addLog('sync', 'error', `chain handoff failed: ${chainErr?.message}`)
          await finishScan(adminDb, companyId!, 'error')
        }
      } else if (e instanceof ScanAbortError) {
        // FIX 3 — circuit-breaker abort (stop / call-cap / timeout): clean terminal.
        finalStatus = e.status === 'stopped' ? 'stopped' : 'error'
        addLog('sync', e.status === 'stopped' ? 'skipped' : 'error', `aborted: ${e.reason}`)
        await finishScan(adminDb, companyId!, e.status)
      } else {
        addLog('sync', 'error', e?.message ?? 'unexpected error')
        finalStatus = 'error'
        await finishScan(adminDb, companyId!, 'error')
      }
    } finally {
      const now = new Date().toISOString()
      const nextSync = new Date(Date.now() + SYNC_INTERVAL_MS).toISOString()
      try {
        // Accumulate this window's log onto whatever is already stored (prior
        // chained windows + any 'kept_existing' rows the guard layer appended).
        // The first window cleared sync_log, so curLog is empty there.
        let mergedLog: any[] = log
        try {
          const { data: cur } = await adminDb
            .from('companies').select('sync_log').eq('id', companyId).single()
          const curLog = Array.isArray((cur as any)?.sync_log) ? (cur as any).sync_log : []
          mergedLog = [...curLog, ...log]
        } catch { /* best-effort merge */ }

        // A chained window keeps the company 'running' (the scan continues in the
        // next invocation) and must NOT set next_sync_at.
        const persistedStatus = finalStatus === 'chained' ? 'running' : finalStatus
        await adminDb.from('companies').update({
          sync_status: persistedStatus,
          last_sync_at: now,
          ...(finalStatus === 'done' ? { next_sync_at: nextSync } : {}),
          sync_log: mergedLog,
        } as any).eq('id', companyId)
      } catch (dbErr: any) {
        console.error('[sync/run] finally DB update failed:', dbErr?.message)
      }
    }
  })

  // Return immediately — the scan runs in the background (after()).
  return NextResponse.json({
    started: true,
    company_id: companyId,
    profile,
    resume,
    chain_index: chainIndex,
  })
}
