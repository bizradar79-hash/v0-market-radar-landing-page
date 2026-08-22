/**
 * COMPETITOR TRACKING ENGINE — the pipeline proved in the admin dev tab,
 * packaged for client-facing scans.
 *
 * Per competitor, from a NAME alone:
 *   1. resolve links   — AI link-finder (social + website), CACHED after the
 *                        first success so later scans cost nothing here
 *   2. scrape socials  — BrightData dedicated scrapers, capped at source to
 *                        recent posts (BRIGHTDATA_MAX_POSTS / lookback window)
 *   3. Google reviews  — DataForSEO Maps search → cid → reviews by cid
 *   4. insights        — deterministic, in code. ZERO LLM calls.
 *
 * Best-effort by contract: every stage is independently try/caught, so a dead
 * competitor, a blocked platform or an unconfigured provider degrades to a
 * partial result with a status — it never throws into the caller's scan.
 */
import {
  scrapeUrl, scrapeSocialProfile, postsToText, RequestCounter,
  BRIGHTDATA_COST_PER_REQ, BRIGHTDATA_RECORD_COST, isBrightDataConfigured,
  type SocialPlatform,
} from '@/lib/brightdata/client'
import {
  computeInsights, filterRecentPosts, INTEL_SOURCES, RECENCY_DAYS,
  type IntelSource, type SourceResult, type DerivedInsights,
} from './summarize'
import { findCompetitorLinksAI } from './find-links-ai'
import { computeReviewInsights, type ReviewSnapshot } from './review-insights'
import { fetchGoogleReviews, isReviewsConfigured, searchKeyword, withContext } from '@/lib/seo/google-reviews'
import { resolveMapsId } from './maps-id'
import { resolveReviewsPaths } from './resolve-reviews'
import { searchWebDetailed } from '@/lib/brightdata/client'
import { norm } from '@/lib/match/hebrew-core'

/**
 * Poll ceiling for a competitor's async social collections on the TRACKING path.
 * The dev tab can afford to wait 5 minutes; a chained scan cannot — the
 * per-competitor budget is 150s, so a source that hasn't finished by then is
 * stored as 'processing' and picked up on the next scan (no re-trigger cost).
 */
export const TRACKING_POLL_TIMEOUT_MS = Number(process.env.COMPETITOR_TRACKING_POLL_MS) || 100000

export interface ResolvedLinks {
  website?: string
  instagram?: string
  facebook?: string
  linkedin?: string
  /** Google Business id, cached so we never repeat the Maps search. */
  cid?: string
  mapsUrl?: string
  resolvedAt?: string
}

export interface TrackingCost {
  brightdata: { requests: number; records: number; costUSD: number; precision: 'exact' }
  dataforseo: { calls: number; costUSD: number; precision: 'exact' } | null
  totalUSD: number
}

export interface TrackingResult {
  competitorName: string
  resolvedLinks: ResolvedLinks
  sources: SourceResult[]
  insights: DerivedInsights
  reviews: ResearchReviews | null
  cost: TrackingCost
  scannedAt: string
  /** Set when the competitor yielded nothing at all — shown to the client. */
  note?: string
}
type ResearchReviews = ReviewSnapshot

const SOCIAL_KEYS = ['instagram', 'facebook', 'linkedin'] as const

/**
 * Reuse cached links when we have any. Re-resolving costs an AI call per
 * competitor per scan and can regress a good link into an "unverified" one,
 * so discovery runs ONCE and only repeats when we have nothing (or on force).
 */
export function linksAreUsable(links?: ResolvedLinks | null): boolean {
  if (!links) return false
  return !!(links.website || links.instagram || links.facebook || links.linkedin)
}

async function resolveLinks(
  name: string, knownWebsite: string, cached: ResolvedLinks | null, force: boolean,
): Promise<ResolvedLinks> {
  if (!force && linksAreUsable(cached)) return cached!
  try {
    const { urls } = await findCompetitorLinksAI(name, knownWebsite)
    return {
      ...(cached || {}),
      website: urls.website || cached?.website,
      mapsUrl: (urls as any).googleMaps || cached?.mapsUrl,
      instagram: urls.instagram || cached?.instagram,
      facebook: urls.facebook || cached?.facebook,
      linkedin: urls.linkedin || cached?.linkedin,
      resolvedAt: new Date().toISOString(),
    }
  } catch {
    return cached || {}
  }
}

/** Track ONE competitor end to end. Never throws. */
export async function trackCompetitor(opts: {
  name: string
  /** deriveArea(company).search — the client's area, for the Maps lookup. */
  areaSearch?: string
  /**
   * The client's BUSINESS TYPE (industry term, e.g. "משכנתאות"). A competitor
   * shares the client's industry by definition, so this narrows the Maps search
   * from a bare brand word to the actual business.
   */
  industryContext?: string
  cachedLinks?: ResolvedLinks | null
  /** Re-resolve links and ignore any cache. */
  force?: boolean
  /**
   * Wall-clock stop (epoch ms). Resolution paths are not STARTED past it, so
   * the run returns normally with whatever it has instead of being discarded by
   * a caller-side timeout — the bug that lost a completed 143-review result.
   */
  deadlineAt?: number
}): Promise<TrackingResult> {
  const name = (opts.name || '').trim()
  const counter = new RequestCounter()
  const scannedAt = new Date().toISOString()

  const log = (msg: string) => console.log(`[COMPETITOR-INTEL][${name}] ${msg}`)
  const tStart = Date.now()
  log(`RUN start force=${!!opts.force} cachedLinks=${JSON.stringify(opts.cachedLinks || {})}`)
  const links = await resolveLinks(name, opts.cachedLinks?.website || '', opts.cachedLinks || null, !!opts.force)
  log(`LINKS resolved: ${JSON.stringify({ website: links.website, instagram: links.instagram, facebook: links.facebook, linkedin: links.linkedin, mapsUrl: links.mapsUrl, cid: links.cid })}`)

  // ── Google reviews, in parallel with the scrapes ─────────────────────────
  // A cached cid skips the Maps search entirely (one fewer billed call, and
  // immune to the name-matching being wrong on a later run).
  //
  // RESOLUTION IS TWO-PASS. The first pass uses the client's own area, which is
  // the right geo signal — but DataForSEO only accepts locations from its own
  // catalog, so a city we can't map degrades to country level, and a city we CAN
  // map may still be too tight for a competitor based elsewhere. When the first
  // pass finds nothing, we retry at country level before concluding the business
  // has no listing. Failing to do that reported "לא נמצא עמוד גוגל" for
  // businesses that are plainly on Google.
  /**
   * RESOLVE THE BUSINESS THE WAY A HUMAN DOES, then read its reviews by id.
   *
   * Name-similarity matching is no longer on the critical path: it kept
   * rejecting real businesses whose Google listing title differs from the name
   * the client typed. Instead we try, in order, to FIND THE RIGHT PAGE — and
   * the first path that yields a cid wins:
   *
   *   0. cached cid            — resolved once, never re-fought
   *   1. AI link-finder Maps URL → parse cid/place_id from it
   *   2. DataForSEO Maps search "name + industry + city" → TOP result's cid
   *      (Google's own ranking, exactly what clicking result #1 gives you)
   *   3. plain web search "name industry city" → any Maps/cid link → parse
   *
   * Only when all of them come up empty do we report "no Google page".
   */
  const resolveReviews = async (): Promise<ResearchReviews | null> => {
    const L = (msg: string) => console.log(`[COMPETITOR-INTEL][${name}] ${msg}`)
    if (!isReviewsConfigured()) {
      L('REVIEWS skipped — DATAFORSEO_LOGIN/PASSWORD not configured')
      return null
    }
    const area = (opts.areaSearch || '').trim()
    const ctx = (opts.industryContext || '').trim()
    const site = links.website || ''
    L(`REVIEWS start — industry="${ctx || '(none)'}" area="${area || '(none)'}" website="${site || '(none)'}" cachedCid=${links.cid || '(none)'} aiMapsUrl=${links.mapsUrl || '(none)'}`)

    const queries = [
      withContext(`${name} ${area}`.trim(), ctx),
      withContext(name, ctx),
      searchKeyword(name, ctx),
      name,
    ].filter((q, i, a) => q && a.findIndex((x) => norm(x) === norm(q)) === i)

    // FIRST SUCCESS WINS — see lib/competitor-intel/resolve-reviews (unit-tested
    // against the exact production scenario that lost a 143-review result).
    const outcome = await resolveReviewsPaths({
      cachedCid: links.cid,
      aiMapsUrl: links.mapsUrl,
      queries,
      webQuery: `${[withContext(name, ctx), area].filter(Boolean).join(' ')} google maps`,
      deadlineAt: opts.deadlineAt,
      log: L,
      byId: (id) => fetchGoogleReviews(name, area || 'Israel', id),
      byQuery: (q) => fetchGoogleReviews(name, area || 'Israel', undefined, q, site, true),
      parseMapsUrl: async (url) => {
        const id = await resolveMapsId(url)
        return { cid: id.cid, placeId: id.placeId, error: id.error }
      },
      webSearch: async (q) => {
        const { hits } = await searchWebDetailed(q, 10)
        return hits.map((h) => h.url)
      },
    })
    return shapeReviews(outcome.reviews, outcome.passes)
  }

  /** Shared mapping from a provider result to the stored snapshot. */
  function shapeReviews(r: any, passLog?: string): ResearchReviews {
    return {
      found: r.found,
      title: r.title,
      address: r.address,
      cid: r.cid,
      mapsUrl: r.cid ? `https://www.google.com/maps?cid=${r.cid}` : links.mapsUrl,
      rating: r.rating,
      reviewsCount: r.reviewsCount,
      reviews: r.reviews,
      candidates: r.candidates,
      viaTopResult: r.viaTopResult,
      insights: r.found ? computeReviewInsights(r) : undefined,
      capturedAt: scannedAt,
      costUSD: r.costUSD,
      passes: passLog,
      error: r.error,
    }
  }

  const reviewsPromise: Promise<ResearchReviews | null> = resolveReviews().catch((e: any) => ({
    found: false, rating: null, reviewsCount: null, reviews: [], costUSD: 0,
    capturedAt: scannedAt, error: (e?.message || 'reviews_failed').slice(0, 60),
  }))

  // ── Sources: each one independent, one failure never blocks the others ───
  const sources: SourceResult[] = await Promise.all(
    INTEL_SOURCES.map(async (source: IntelSource): Promise<SourceResult> => {
      const url = ((links as any)[source] || '').trim()
      if (!url) return { source, status: 'skipped', error: 'no_url' }
      if (!isBrightDataConfigured()) return { source, status: 'skipped', error: 'scraper_not_configured' }
      try {
        if (source !== 'website') {
          const t = await scrapeSocialProfile(source as SocialPlatform, url, counter, TRACKING_POLL_TIMEOUT_MS)
          const recent = filterRecentPosts(t.posts)
          return {
            source,
            // 'processing' is NOT a failure — the async collection is still
            // running. We store what we have; the next scan picks it up.
            status: t.status,
            snapshotId: t.snapshotId,
            url,
            text: recent.length ? postsToText(recent, t.profile) : undefined,
            posts: t.posts.length ? t.posts : undefined,
            profile: t.profile,
            postsTotal: t.posts.length,
            postsRecent: recent.length,
            error: t.error,
          }
        }
        const r = await scrapeUrl(url, counter)
        return { source, status: r.status, url, text: r.text || undefined, error: r.error }
      } catch (e: any) {
        return { source, status: 'failed', url, error: (e?.message || 'scrape_failed').slice(0, 80) }
      }
    }),
  )

  const reviews = await reviewsPromise
  log(`SOURCES: ${sources.map((x) => `${x.source}=${x.status}${x.postsRecent != null ? `(${x.postsRecent} recent)` : ''}${x.error ? `[${x.error}]` : ''}`).join(' ')}`)
  log(`REVIEWS: found=${reviews?.found ?? 'n/a'} rating=${reviews?.rating ?? '-'} count=${reviews?.reviewsCount ?? '-'} passes=${reviews?.passes || '-'} err=${reviews?.error || '-'}`)
  // CACHE the resolved cid — the next scan queries reviews by id and skips the
  // Maps search entirely (cheaper, and can't regress into a bad name match).
  if (reviews?.cid) links.cid = reviews.cid
  if (reviews?.mapsUrl) links.mapsUrl = reviews.mapsUrl

  // Deterministic insights — no briefing items, because there is no LLM.
  const insights = computeInsights(sources, [], new Date(), RECENCY_DAYS)

  const cost: TrackingCost = {
    brightdata: {
      requests: counter.total,
      records: counter.records,
      costUSD: counter.total * BRIGHTDATA_COST_PER_REQ + counter.records * BRIGHTDATA_RECORD_COST,
      precision: 'exact',
    },
    dataforseo: reviews
      ? { calls: reviews.found && reviews.reviewsCount ? 2 : 1, costUSD: reviews.costUSD, precision: 'exact' }
      : null,
    totalUSD: 0,
  }
  cost.totalUSD = cost.brightdata.costUSD + (cost.dataforseo?.costUSD || 0)

  const gotSomething =
    sources.some((s) => s.status === 'ok') || !!reviews?.found
  log(`RUN done in ${Math.round((Date.now() - tStart) / 1000)}s — cost $${cost.totalUSD.toFixed(4)}`)
  return {
    competitorName: name,
    resolvedLinks: links,
    sources,
    insights,
    reviews,
    cost,
    scannedAt,
    note: gotSomething ? undefined : 'לא נמצא מידע פומבי על המתחרה הזה',
  }
}

/** Staleness gate — mirrors the leads change-signature idea for cost control. */
export const TRACKING_MIN_DAYS = Number(process.env.COMPETITOR_TRACKING_MIN_DAYS) || 6
export function isFresh(scannedAt?: string | null, now = new Date()): boolean {
  if (!scannedAt) return false
  const t = new Date(scannedAt).getTime()
  if (isNaN(t)) return false
  return now.getTime() - t < TRACKING_MIN_DAYS * 86400000
}
