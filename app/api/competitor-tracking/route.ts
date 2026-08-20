export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

import { NextResponse, after } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { getFullContext } from '@/lib/context'
import { deriveArea } from '@/lib/geo/area'
import { MAX_DIRECT_COMPETITORS } from '@/lib/flags'
import { trackCompetitor, isFresh, TRACKING_MIN_DAYS, type ResolvedLinks } from '@/lib/competitor-intel/engine'

/** Per-competitor wall-clock budget, so one hung scrape can't starve the rest. */
const COMPETITOR_BUDGET_MS = Number(process.env.COMPETITOR_TIME_BUDGET_MS) || 240000
import { ScanCostCollector } from '@/lib/scan/cost-tracker'

function adminDb() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

/**
 * POST /api/competitor-tracking[?force=true]
 *
 * Tracks the client's DIRECT competitors (business_profile.directCompetitors,
 * max 5 — the single source of truth set in onboarding/settings).
 *
 * COST CONTROL, mirroring the leads change-gate:
 *  - hard cap of MAX_DIRECT_COMPETITORS
 *  - a competitor scanned within TRACKING_MIN_DAYS is SKIPPED (no scrape, no
 *    reviews call) unless force=true
 *  - link discovery runs once and is cached in resolved_links
 *  - post counts are capped at the scraper (BRIGHTDATA_MAX_POSTS + lookback)
 *  - no LLM anywhere on this path
 *
 * EXECUTION MODE. Tracking five competitors means several minutes of async
 * scrapes. Two modes:
 *  - default (background=true): the loop runs inside after(), so the HTTP
 *    response returns immediately and the work continues on the server. Closing
 *    the browser tab cannot kill it — same reason /api/sync/start uses after().
 *  - background=false: await the loop and return the per-competitor results.
 *    Used by the scan (sync/run), which is itself already server-side and needs
 *    the summary for its step message.
 */
export async function POST(request: Request) {
  const params = new URL(request.url).searchParams
  const force = params.get('force') === 'true'
  // The admin module-sync button opts INTO background so the run survives the
  // admin closing the dialog or the tab.
  const background = params.get('background') === 'true'
  // CHAINING (same mechanism the main scan uses to beat the function timeout):
  // one competitor per invocation, each chaining into a fresh one.
  const cursor = Math.max(0, Number(params.get('cursor')) || 0)
  const chainIndex = Math.max(0, Number(params.get('chain_index')) || 0)

  const ctx = await getFullContext()
  const company: any = ctx?.company
  if (!company?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId: string = company.id
  const db = adminDb()

  const bp: any = company.business_profile || {}
  const names: string[] = (Array.isArray(bp.directCompetitors) ? bp.directCompetitors : [])
    .map((n: any) => String(n || '').trim())
    .filter(Boolean)
    .slice(0, MAX_DIRECT_COMPETITORS)

  if (names.length === 0) {
    return NextResponse.json({
      success: true, tracked: 0, skipped: 0,
      message: 'no direct competitors configured',
    })
  }

  const area = deriveArea(company, bp)

  // Existing rows carry the cached links + the freshness stamp.
  const { data: existing } = await db
    .from('competitor_tracking')
    .select('competitor_name, resolved_links, scanned_at')
    .eq('company_id', companyId)
  const byName = new Map<string, any>((existing || []).map((r: any) => [r.competitor_name, r]))

  // Feeds the same scan_control.cost_breakdown table every other module uses,
  // so competitor tracking shows up in the scan cost log. Both providers bill
  // per request/record, so we pass the EXACT dollar figures rather than tokens.
  const cost = new ScanCostCollector(companyId, 'competitor_tracking')

  const details: Array<{ name: string; status: string; message?: string }> = []

  /**
   * Track ONE competitor, with its own time budget. A single BrightData poll can
   * legitimately run five minutes; without a per-competitor cap one slow
   * competitor would consume the whole invocation and starve the rest.
   */
  async function runOne(name: string): Promise<{ tracked: boolean; skipped: boolean; costUSD: number }> {
    const row = byName.get(name)
    if (!force && isFresh(row?.scanned_at)) {
      details.push({ name, status: 'skipped', message: `fresh (< ${TRACKING_MIN_DAYS}d)` })
      return { tracked: false, skipped: true, costUSD: 0 }
    }
    try {
      const result = await Promise.race([
        trackCompetitor({
          name,
          areaSearch: area.search,
          cachedLinks: (row?.resolved_links || null) as ResolvedLinks | null,
          // Only an explicit force re-runs link discovery; otherwise the cache wins.
          force,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('competitor_time_budget_exceeded')), COMPETITOR_BUDGET_MS)),
      ])
      const { error } = await db.from('competitor_tracking').upsert({
        company_id: companyId,
        competitor_name: name,
        resolved_links: result.resolvedLinks,
        sources: result.sources,
        insights: result.insights,
        reviews: result.reviews,
        cost: result.cost,
        scanned_at: result.scannedAt,
      }, { onConflict: 'company_id,competitor_name' })
      if (error) {
        details.push({ name, status: 'error', message: error.message })
        return { tracked: false, skipped: false, costUSD: 0 }
      }
      if (result.cost.brightdata.requests || result.cost.brightdata.records) {
        cost.add({ provider: 'brightdata', model: 'scrapers', costUSD: result.cost.brightdata.costUSD })
      }
      if (result.cost.dataforseo) {
        cost.add({ provider: 'dataforseo', model: 'google_reviews', costUSD: result.cost.dataforseo.costUSD })
      }
      details.push({
        name,
        status: 'ok',
        message: `${result.sources.filter(s => s.status === 'ok').length} sources · reviews ${result.reviews?.found ? 'ok' : 'none'}`,
      })
      return { tracked: true, skipped: false, costUSD: result.cost.totalUSD }
    } catch (e: any) {
      // BEST EFFORT: one bad or slow competitor must never stop the chain.
      details.push({ name, status: 'error', message: (e?.message || 'failed').slice(0, 120) })
      return { tracked: false, skipped: false, costUSD: 0 }
    }
  }

  /** Chain into a fresh invocation for the NEXT competitor. */
  function chainNext(next: number) {
    if (next >= names.length || chainIndex >= names.length + 2) return
    const origin = new URL(request.url).origin
    const qs = new URLSearchParams({
      force: String(force), background: 'true',
      cursor: String(next), chain_index: String(chainIndex + 1),
    })
    void fetch(`${origin}/api/competitor-tracking?${qs}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-user-id': companyId,
        'x-admin-secret': process.env.SUPABASE_SERVICE_ROLE_KEY!,
      },
      body: JSON.stringify({}),
    }).catch((e: any) => console.error('[competitor-tracking] chain failed:', e?.message))
  }

  // Synchronous mode (the scan): process everything in this invocation. The scan
  // is already chunked by sync/run's own chaining, and it needs the summary.
  async function runAll(): Promise<{ tracked: number; skipped: number; costUSD: number }> {
    let tracked = 0, skipped = 0, costUSD = 0
    for (const name of names) {
      const r = await runOne(name)
      if (r.tracked) tracked++
      if (r.skipped) skipped++
      costUSD += r.costUSD
    }
    await cost.flush()
    return { tracked, skipped, costUSD }
  }

  // BACKGROUND + CHAINED: this invocation handles exactly ONE competitor, then
  // triggers a fresh invocation for the next. Five competitors sequentially in a
  // single request exceeded the function limit and died after ~2; one per
  // invocation gives each the full budget, mirroring how /api/sync/run chains
  // module windows. Every competitor is an idempotent upsert, so re-running or
  // re-entering a step is safe.
  if (background) {
    const name = names[cursor]
    if (!name) {
      return NextResponse.json({ success: true, background: true, finished: true, total: names.length })
    }
    after(async () => {
      try {
        const r = await runOne(name)
        await cost.flush()
        console.log(`[competitor-tracking] ${companyId} [${cursor + 1}/${names.length}] ${name}: ${r.tracked ? 'tracked' : r.skipped ? 'fresh' : 'failed'} $${r.costUSD.toFixed(4)}`)
      } catch (e: any) {
        console.error('[competitor-tracking] background failed:', e?.message)
      } finally {
        // ALWAYS chain, even after a failure — the rest must still run.
        chainNext(cursor + 1)
      }
    })
    return NextResponse.json({
      success: true, background: true, total: names.length,
      cursor, competitor: name,
      message: `הסריקה רצה ברקע עבור ${names.length} מתחרים — אפשר לסגור את החלון`,
    })
  }

  const { tracked, skipped, costUSD } = await runAll()
  return NextResponse.json({
    success: true,
    tracked,
    skipped,
    total: names.length,
    costUSD: Math.round(costUSD * 10000) / 10000,
    details,
  })
}
