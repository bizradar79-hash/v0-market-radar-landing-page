export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { getFullContext } from '@/lib/context'
import { deriveArea } from '@/lib/geo/area'
import { MAX_DIRECT_COMPETITORS } from '@/lib/flags'
import { trackCompetitor, isFresh, TRACKING_MIN_DAYS, type ResolvedLinks } from '@/lib/competitor-intel/engine'

/**
 * Per-competitor wall-clock budget, passed INTO the engine as a deadline.
 *
 * It used to be a Promise.race around the whole run. That race is what lost a
 * completed result: a run had already resolved 143 reviews when the 150s timer
 * fired, the race rejected, the catch skipped the upsert entirely, and the
 * PREVIOUS run's failure row survived — so a success was reported to the logs
 * and a failure was persisted. A deadline the engine honours internally lets the
 * run return normally with whatever it has, and we always persist that.
 */
const COMPETITOR_BUDGET_MS = Number(process.env.COMPETITOR_TIME_BUDGET_MS) || 200000
/** Absolute backstop, only for a genuinely stuck run. Below maxDuration (300s). */
const HARD_STOP_MS = Number(process.env.COMPETITOR_HARD_STOP_MS) || 275000
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
 * EXECUTION MODES.
 *  - ?only=<name>  — run EXACTLY ONE competitor, synchronously, and return its
 *    real result. This is what the admin UI drives: one request per competitor,
 *    no chaining, no after() continuation, nothing that depends on the platform
 *    keeping an invocation alive past its response.
 *  - no params — run every competitor sequentially and return the summary. Used
 *    by the weekly scan (sync/run), which is already server-side and chunked by
 *    its own window chaining.
 *
 * WHY THE CHAIN IS GONE: processing five competitors across self-triggered
 * invocations kept stalling part-way on Vercel. Each competitor is an
 * idempotent upsert, so driving them one-per-request from the browser is
 * strictly more reliable and fully observable — and if the tab closes, whatever
 * finished is already saved.
 */
/**
 * Wrapper so this route ALWAYS answers with JSON. An unhandled throw would
 * otherwise surface to the caller as a naked 500 (or a dropped connection),
 * which is indistinguishable from a network failure — exactly the kind of
 * opaque "Failed to fetch" we just spent a round diagnosing.
 */
export async function POST(request: Request) {
  try {
    return await handlePost(request)
  } catch (e: any) {
    console.error('[COMPETITOR-INTEL] route crashed:', e?.stack || e?.message)
    return NextResponse.json(
      { error: (e?.message || 'competitor_tracking_failed').slice(0, 300) },
      { status: 500 },
    )
  }
}

async function handlePost(request: Request) {
  const params = new URL(request.url).searchParams
  const force = params.get('force') === 'true'
  /** Run a SINGLE named competitor and return its result. */
  const only = (params.get('only') || '').trim()

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

  /**
   * BUSINESS-TYPE CONTEXT for the Google Maps lookup. A direct competitor is by
   * definition in the client's own industry, so the client's industry term is a
   * free, safe disambiguator: searching Maps for "לימון" nationally returns
   * cafés and juice bars, while "לימון משכנתאות" returns the business.
   * Kept to a couple of words — a long phrase narrows Maps too far.
   */
  const industryContext = [
    Array.isArray(bp.industryTags) ? bp.industryTags[0] : '',
    company.industry,
    bp.coreActivity,
  ].map((v: any) => String(v || '').trim()).find(Boolean)?.split(/[,·|]/)[0]?.trim().split(/\s+/).slice(0, 2).join(' ') || ''

  // Existing rows carry the cached links + the freshness stamp.
  const { data: existing } = await db
    .from('competitor_tracking')
    .select('competitor_name, resolved_links, scanned_at, website_snapshot')
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
    // Asking for ONE competitor by name is always deliberate, so the staleness
    // gate never applies there. It still protects the automatic weekly scan,
    // which is the only place it exists to save cost.
    if (!force && !only && isFresh(row?.scanned_at)) {
      details.push({ name, status: 'skipped', message: `fresh (< ${TRACKING_MIN_DAYS}d)` })
      return { tracked: false, skipped: true, costUSD: 0 }
    }
    try {
      const result = await Promise.race([
        trackCompetitor({
          name,
          areaSearch: area.search,
          industryContext,
          cachedLinks: (row?.resolved_links || null) as ResolvedLinks | null,
          // Last run's cleaned site text — the basis for change detection.
          prevWebsiteSnapshot: row?.website_snapshot || null,
          // Only an explicit force re-runs link discovery; otherwise the cache wins.
          force,
          // The engine stops STARTING new work past this and returns normally,
          // so a slow run yields a result to persist instead of being discarded.
          // The race below is now only a stuck-process backstop.
          deadlineAt: Date.now() + COMPETITOR_BUDGET_MS,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('competitor_hard_stop')), HARD_STOP_MS)),
      ])
      console.log(`[COMPETITOR-INTEL][${name}] PERSISTING reviews.found=${result.reviews?.found ?? 'n/a'} rating=${result.reviews?.rating ?? '-'} count=${result.reviews?.reviewsCount ?? '-'} passes=${result.reviews?.passes || '-'}`)
      const { error } = await db.from('competitor_tracking').upsert({
        company_id: companyId,
        competitor_name: name,
        resolved_links: result.resolvedLinks,
        sources: result.sources,
        insights: result.insights,
        reviews: result.reviews,
        // Website change detection: the diff verdict + the snapshot chain.
        website: result.website
          ? {
              status: result.website.status,
              changes: result.website.changes,
              similarity: result.website.similarity,
              checkedAt: result.website.checkedAt,
              note: result.website.note,
              error: result.website.error,
            }
          : null,
        website_snapshot: result.website?.snapshot || null,
        website_snapshot_prev: row?.website_snapshot || null,
        website_snapshot_at: result.website?.checkedAt || null,
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
      // Only ever present when the competitor's site actually changed.
      if (result.cost.websiteDiff) {
        cost.add({
          provider: 'gemini',
          model: result.cost.websiteDiff.model,
          promptTokens: result.cost.websiteDiff.promptTokens,
          completionTokens: result.cost.websiteDiff.completionTokens,
          costUSD: result.cost.websiteDiff.costUSD,
        })
      }
      details.push({
        name,
        status: 'ok',
        message: `${result.sources.filter(s => s.status === 'ok').length} sources · reviews ${result.reviews?.found ? 'ok' : 'none'}`,
      })
      return { tracked: true, skipped: false, costUSD: result.cost.totalUSD }
    } catch (e: any) {
      // BEST EFFORT: a bad competitor must never take down the run. Nothing is
      // written here, so any EXISTING row is left untouched — which is why the
      // stale-failure symptom was so confusing. Log loudly.
      console.error(`[COMPETITOR-INTEL][${name}] RUN FAILED — nothing persisted, previous row kept:`, e?.message)
      details.push({ name, status: 'error', message: (e?.message || 'failed').slice(0, 120) })
      return { tracked: false, skipped: false, costUSD: 0 }
    }
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

  // SINGLE COMPETITOR — the manual path. One request, one competitor, a real
  // answer. Saved independently, so a failure here costs nothing already done.
  if (only) {
    const name = names.find((n) => n === only)
      || names.find((n) => n.trim() === only.trim())
    if (!name) {
      return NextResponse.json({ error: `Competitor not configured: ${only}` }, { status: 400 })
    }
    const r = await runOne(name)
    await cost.flush()
    const detail = details.find((d) => d.name === name)
    const { data: saved } = await db
      .from('competitor_tracking')
      .select('competitor_name, resolved_links, sources, reviews, website, scanned_at')
      .eq('company_id', companyId).eq('competitor_name', name).maybeSingle()
    const srcs: any[] = (saved?.sources as any) || []
    return NextResponse.json({
      success: true,
      competitor: name,
      status: detail?.status || (r.tracked ? 'ok' : 'error'),
      message: detail?.message,
      costUSD: Math.round(r.costUSD * 10000) / 10000,
      // Per-source truth, so the admin sees what actually came back.
      sources: srcs.map((x) => ({ source: x.source, status: x.status, postsRecent: x.postsRecent ?? 0, error: x.error })),
      website: (saved as any)?.website || null,
      reviews: saved?.reviews
        ? {
            found: (saved.reviews as any).found,
            rating: (saved.reviews as any).rating,
            reviewsCount: (saved.reviews as any).reviewsCount,
            passes: (saved.reviews as any).passes,
            error: (saved.reviews as any).error,
          }
        : null,
      scannedAt: saved?.scanned_at,
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
