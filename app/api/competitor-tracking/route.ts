export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { getFullContext } from '@/lib/context'
import { deriveArea } from '@/lib/geo/area'
import { MAX_DIRECT_COMPETITORS } from '@/lib/flags'
import { trackCompetitor, isFresh, TRACKING_MIN_DAYS, type ResolvedLinks } from '@/lib/competitor-intel/engine'
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
 */
export async function POST(request: Request) {
  const force = new URL(request.url).searchParams.get('force') === 'true'

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

  let tracked = 0
  let skipped = 0
  let costUSD = 0
  const details: Array<{ name: string; status: string; message?: string }> = []

  // Sequential on purpose: each competitor can fire several BrightData
  // collections, and running five in parallel risks provider rate limits and a
  // 300s wall-clock overrun.
  for (const name of names) {
    const row = byName.get(name)
    if (!force && isFresh(row?.scanned_at)) {
      skipped++
      details.push({ name, status: 'skipped', message: `fresh (< ${TRACKING_MIN_DAYS}d)` })
      continue
    }
    try {
      const result = await trackCompetitor({
        name,
        areaSearch: area.search,
        cachedLinks: (row?.resolved_links || null) as ResolvedLinks | null,
        // Only an explicit force re-runs link discovery; otherwise the cache wins.
        force,
      })
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
        continue
      }
      tracked++
      costUSD += result.cost.totalUSD
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
    } catch (e: any) {
      // BEST EFFORT: one bad competitor must never fail the module, let alone
      // the scan that called it.
      details.push({ name, status: 'error', message: (e?.message || 'failed').slice(0, 120) })
    }
  }

  await cost.flush()

  return NextResponse.json({
    success: true,
    tracked,
    skipped,
    total: names.length,
    costUSD: Math.round(costUSD * 10000) / 10000,
    details,
  })
}
