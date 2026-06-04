export const dynamic = 'force-dynamic'
export const maxDuration = 300 // Vercel Pro — long-running sync

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@/lib/supabase/server'
import { captureSnapshot } from '@/lib/scan/snapshot'
import { headers } from 'next/headers'

const SYNC_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const SYNC_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes hard limit

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

  if (!force && company.sync_status === 'running') {
    return NextResponse.json({ message: 'Sync already running', sync_status: 'running' })
  }

  // Layer 2: capture a full pre-scan snapshot before anything mutates state.
  await captureSnapshot(adminDb, companyId, 'full')

  // Mark as running
  await adminDb.from('companies').update({
    sync_status: 'running',
    last_sync_at: new Date().toISOString(),
    sync_log: [],
  }).eq('id', companyId)

  const log: LogEntry[] = []
  const ts = () => new Date().toISOString()

  function addLog(module: string, status: ModuleStatus, message: string) {
    log.push({ module, status, message, updated_at: ts() })
  }

  // ── Inner function with all module calls ──────────────────────────────────
  async function runAllModules() {
    // 1. Competitors
    const { count: autoCount } = await adminDb
      .from('competitors')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .neq('source', 'manual')

    if ((autoCount ?? 0) < 10) {
      const r = await callModule(origin, '/api/find-competitors', companyId!, false)
      addLog('competitors', r.ok ? 'ok' : 'error', r.ok ? `found ${r.body?.count ?? 0}` : (r.body?.error ?? `HTTP ${r.status}`))
      await new Promise(res => setTimeout(res, 2000))
    } else {
      addLog('competitors', 'skipped', `already have ${autoCount} auto competitors`)
    }

    // 1b. All competitor ratings (manual + auto, missing google_rating)
    {
      const r = await callModule(origin, '/api/sync-competitor-ratings', companyId!)
      addLog('competitor_ratings', r.ok ? 'ok' : 'error', r.ok ? `${r.body?.updated ?? 0} updated` : (r.body?.error ?? `HTTP ${r.status}`))
      await new Promise(res => setTimeout(res, 1000))
    }

    // 1c. Company Google Maps review data
    {
      const r = await callModule(origin, '/api/analyze-company-reviews', companyId!)
      addLog('review_analysis', r.ok ? 'ok' : 'error', r.ok ? (r.body?.google_rating != null ? `rating=${r.body.google_rating}` : 'no rating found') : (r.body?.error ?? `HTTP ${r.status}`))
      await new Promise(res => setTimeout(res, 1000))
    }

    // 2. SEO ranking
    {
      const r = await callModule(origin, '/api/generate-seo-ranking', companyId!)
      addLog('seo_ranking', r.ok ? 'ok' : 'error', r.ok ? 'refreshed' : (r.body?.error ?? `HTTP ${r.status}`))
      await new Promise(res => setTimeout(res, 2000))
    }

    // 3. GEO ranking
    {
      const r = await callModule(origin, '/api/generate-geo-ranking', companyId!)
      addLog('geo_ranking', r.ok ? 'ok' : 'error', r.ok ? 'refreshed' : (r.body?.error ?? `HTTP ${r.status}`))
      await new Promise(res => setTimeout(res, 2000))
    }

    // 4. Industry trends
    {
      const r = await callModule(origin, '/api/industry-trends', companyId!)
      addLog('industry_trends', r.ok ? 'ok' : 'error', r.ok ? `${r.body?.trends?.length ?? 0} trends` : (r.body?.error ?? `HTTP ${r.status}`))
      await new Promise(res => setTimeout(res, 2000))
    }

    // 4b. Keyword trends
    {
      const keywords: string[] = ((company as any).keywords || []).slice(0, 8)
      const adminHeaders = {
        'Content-Type': 'application/json',
        'x-admin-user-id': companyId!,
        'x-admin-secret': process.env.SUPABASE_SERVICE_ROLE_KEY!,
      }
      let kwUpdated = 0
      const kwErrors: string[] = []
      console.log(`[sync:keyword_trends] processing ${keywords.length} keywords for company ${companyId}`)
      for (const keyword of keywords) {
        try {
          const res = await fetch(`${origin}/api/generate-keyword-trends?force=true`, {
            method: 'POST',
            headers: adminHeaders,
            body: JSON.stringify({ keyword, force: true }),
          })
          if (res.ok) {
            const data = await res.json().catch(() => ({}))
            const trendsCount = (data.israel || data.trends || []).length
            console.log(`[sync:keyword_trends] "${keyword}" → ${trendsCount} trends`)
            kwUpdated++
          } else {
            const errText = await res.text().catch(() => '')
            const msg = `"${keyword}": HTTP ${res.status} — ${errText.slice(0, 100)}`
            kwErrors.push(msg)
            console.error(`[sync:keyword_trends] ${msg}`)
            addLog('keyword_trends', 'error', msg)
          }
        } catch (e: any) {
          const msg = `"${keyword}": ${e?.message}`
          kwErrors.push(msg)
          console.error(`[sync:keyword_trends] error for ${msg}`)
          addLog('keyword_trends', 'error', msg)
        }
      }
      const status: ModuleStatus = kwUpdated > 0 ? 'ok' : 'error'
      addLog('keyword_trends', status, `${kwUpdated}/${keywords.length} keywords updated${kwErrors.length ? ` | errors: ${kwErrors.slice(0, 2).join('; ')}` : ''}`)
      await new Promise(res => setTimeout(res, 1000))
    }

    // 5. Competitor trends
    {
      const r = await callModule(origin, '/api/competitor-trends', companyId!)
      addLog('competitor_trends', r.ok ? 'ok' : 'error', r.ok ? `${r.body?.competitor_data?.length ?? 0} competitors` : (r.body?.error ?? `HTTP ${r.status}`))
      await new Promise(res => setTimeout(res, 2000))
    }

    // 6. News
    {
      const r = await callModule(origin, '/api/generate-news', companyId!)
      addLog('news', r.ok ? 'ok' : 'error', r.ok ? `${r.body?.count ?? 0} articles` : (r.body?.error ?? `HTTP ${r.status}`))
      await new Promise(res => setTimeout(res, 2000))
    }

    // 7. Tenders
    {
      const { count: existingTenders } = await adminDb
        .from('tenders').select('id', { count: 'exact', head: true }).eq('company_id', companyId)
      const r = await callModule(origin, '/api/find-tenders', companyId!)
      const newCount = r.body?.count ?? 0
      if (r.ok && newCount >= (existingTenders ?? 0)) {
        addLog('tenders', 'ok', `${newCount} tenders`)
      } else if (r.ok) {
        addLog('tenders', 'skipped', `new count ${newCount} < existing ${existingTenders}`)
      } else {
        addLog('tenders', 'error', r.body?.error ?? `HTTP ${r.status}`)
      }
      await new Promise(res => setTimeout(res, 2000))
    }

    // 8. Leads
    {
      const { count: leadsCount } = await adminDb
        .from('leads').select('id', { count: 'exact', head: true }).eq('company_id', companyId)
      if ((leadsCount ?? 0) < 5) {
        const r = await callModule(origin, '/api/generate-leads', companyId!)
        addLog('leads', r.ok ? 'ok' : 'error', r.ok ? `${r.body?.count ?? 0} leads` : (r.body?.error ?? `HTTP ${r.status}`))
        await new Promise(res => setTimeout(res, 2000))
      } else {
        addLog('leads', 'skipped', `already have ${leadsCount} leads`)
      }
    }

    // 9. Weekly actions
    {
      const r = await callModule(origin, '/api/generate-weekly-actions', companyId!)
      addLog('weekly_actions', r.ok ? 'ok' : 'error', r.ok ? `${r.body?.actions?.length ?? 0} actions` : (r.body?.error ?? `HTTP ${r.status}`))
      await new Promise(res => setTimeout(res, 2000))
    }

    // 10. Niche opportunities
    {
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
      addLog('niche_opportunities', r.ok ? 'ok' : 'error', r.ok ? `${r.body?.opportunities?.length ?? 0} niches` : (r.body?.error ?? `HTTP ${r.status}`))

      if (r.ok && preservedStatuses.size > 0) {
        const { data: freshCompany } = await adminDb
          .from('companies').select('niche_opportunities').eq('id', companyId).single()
        const freshData = freshCompany?.niche_opportunities as any
        if (freshData?.opportunities?.length) {
          let changed = false
          const updated = freshData.opportunities.map((n: any) => {
            const key = (n.nicheTitle ?? '').toLowerCase().trim()
            const savedStatus = preservedStatuses.get(key)
            if (savedStatus && n.status !== savedStatus) {
              changed = true
              return { ...n, status: savedStatus }
            }
            return n
          })
          if (changed) {
            await adminDb.from('companies').update({
              niche_opportunities: { ...freshData, opportunities: updated }
            } as any).eq('id', companyId)
          }
        }
      }
    }

    // 11. Weekly report
    {
      const r = await callModule(origin, '/api/generate-weekly-report', companyId!)
      addLog('weekly_report', r.ok ? 'ok' : 'error', r.ok ? (r.body?.report?.generated_at ? `generated at ${r.body.report.generated_at}` : 'generated') : (r.body?.error ?? `HTTP ${r.status}`))
      await new Promise(res => setTimeout(res, 2000))
    }
  }

  // ── Run with timeout + guaranteed finally cleanup ─────────────────────────
  let finalStatus: 'done' | 'error' | 'idle' = 'idle'
  let returnResponse: NextResponse

  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Sync timeout: exceeded 10 minutes')), SYNC_TIMEOUT_MS)
    )

    await Promise.race([runAllModules(), timeoutPromise])

    finalStatus = 'done'
    returnResponse = NextResponse.json({ success: true, company_id: companyId, log })
  } catch (e: any) {
    addLog('sync', 'error', e?.message ?? 'unexpected error')
    finalStatus = 'error'
    returnResponse = NextResponse.json({ success: false, error: e?.message, log }, { status: 500 })
  } finally {
    const now = new Date().toISOString()
    const nextSync = new Date(Date.now() + SYNC_INTERVAL_MS).toISOString()
    try {
      // Merge any 'kept_existing' entries that modules appended to sync_log
      // during the run (the guard layer writes them) so we don't clobber them.
      let mergedLog: any[] = log
      try {
        const { data: cur } = await adminDb
          .from('companies').select('sync_log').eq('id', companyId).single()
        const curLog = Array.isArray((cur as any)?.sync_log) ? (cur as any).sync_log : []
        const kept = curLog.filter((e: any) => e?.status === 'kept_existing')
        mergedLog = [...log, ...kept]
      } catch { /* best-effort merge */ }

      await adminDb.from('companies').update({
        sync_status: finalStatus,
        last_sync_at: now,
        ...(finalStatus === 'done' ? { next_sync_at: nextSync } : {}),
        sync_log: mergedLog,
      } as any).eq('id', companyId)
    } catch (dbErr: any) {
      console.error('[sync/run] finally DB update failed:', dbErr?.message)
    }
  }

  return returnResponse!
}
