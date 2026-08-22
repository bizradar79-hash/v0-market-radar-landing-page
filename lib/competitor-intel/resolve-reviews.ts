/**
 * Google-business resolution for a competitor: try each path, FIRST SUCCESS WINS.
 *
 * Extracted from the engine and dependency-injected so the exact production
 * scenario can be reproduced in a unit test without any provider credentials.
 *
 * THE BUG THIS ENCODES AGAINST: a run resolved 143 reviews via the AI Maps URL,
 * and the saved record still read `no_confident_name_match`. The resolution
 * itself was correct — it short-circuits on success — but the caller discarded
 * the completed result, so the previous run's failure row survived. The rules
 * below are therefore invariants, not preferences:
 *   1. the moment a path yields a usable result, return it and run nothing else
 *   2. a later path can NEVER replace an earlier success
 *   3. the returned `passes` trail must describe the result actually returned
 */

export interface ReviewsLike {
  found: boolean
  rating: number | null
  reviewsCount: number | null
  reviews: any[]
  cid?: string
  placeId?: string
  title?: string
  address?: string
  candidates?: Array<{ title: string; score: number; cid?: string; address?: string }>
  viaTopResult?: boolean
  costUSD: number
  error?: string
}

export interface ResolveDeps {
  /** Reviews by an already-known id (cached cid, or one parsed from a Maps URL). */
  byId: (id: { cid?: string; placeId?: string }) => Promise<ReviewsLike>
  /** Maps search for a keyword, trusting Google's top result. */
  byQuery: (keyword: string) => Promise<ReviewsLike>
  /** Parse a Maps URL into cid/place_id. */
  parseMapsUrl: (url: string) => Promise<{ cid?: string; placeId?: string; error?: string }>
  /** Plain web search returning candidate URLs. */
  webSearch: (query: string) => Promise<string[]>
  /** Ordered Maps queries to try (most specific first). */
  queries: string[]
  /** Web-search query for the last-resort path. */
  webQuery: string
  cachedCid?: string
  aiMapsUrl?: string
  log?: (msg: string) => void
  /** Optional wall-clock stop: paths are not started past this timestamp. */
  deadlineAt?: number
}

export interface ResolveOutcome {
  reviews: ReviewsLike
  /** Trail of paths attempted, in order, describing THIS outcome. */
  passes: string
  /** Which path produced the returned result ('' when none did). */
  resolvedBy: string
  costUSD: number
}

/** A result is only a success if it actually carries a usable business. */
export function isUsable(r: ReviewsLike | null | undefined): boolean {
  return !!r && r.found === true && (r.rating != null || (r.reviewsCount ?? 0) > 0 || r.reviews.length > 0)
}

const MAPS_LINK = /google\.[a-z.]+\/maps|maps\.app\.goo\.gl|[?&](cid|ludocid)=/i

export async function resolveReviewsPaths(deps: ResolveDeps): Promise<ResolveOutcome> {
  const L = deps.log || (() => {})
  const tried: string[] = []
  let spent = 0
  let lastFailure: ReviewsLike | null = null

  const outOfTime = () => deps.deadlineAt != null && Date.now() >= deps.deadlineAt

  /** Accept a result: record cost, and if usable, STOP — nothing may override it. */
  const accept = (r: ReviewsLike, label: string): ResolveOutcome | null => {
    spent += r.costUSD || 0
    if (isUsable(r)) {
      tried.push(label)
      L(`RESOLVED via ${label} — rating=${r.rating} count=${r.reviewsCount}`)
      // INVARIANT 3: the trail ends at the path that actually produced this.
      return { reviews: { ...r, costUSD: spent }, passes: tried.join(' · '), resolvedBy: label, costUSD: spent }
    }
    tried.push(`${label}:${r.error || 'empty'}`)
    lastFailure = r
    return null
  }

  // ── PATH 0: a cid resolved on an earlier run ──────────────────────────────
  if (deps.cachedCid) {
    const hit = accept(await deps.byId({ cid: deps.cachedCid }), 'cached-cid')
    if (hit) return hit
  }

  // ── PATH 1: the Maps URL the AI link-finder produced ──────────────────────
  if (deps.aiMapsUrl && !outOfTime()) {
    const id = await deps.parseMapsUrl(deps.aiMapsUrl)
    if (id.cid || id.placeId) {
      const hit = accept(await deps.byId({ cid: id.cid, placeId: id.placeId }), 'ai-maps-url')
      if (hit) return hit
    } else {
      tried.push(`ai-maps-url:${id.error || 'no_id'}`)
    }
  }

  // ── PATH 2: DataForSEO Maps search, trusting Google's top result ──────────
  for (const q of deps.queries) {
    if (outOfTime()) { tried.push('maps:deadline'); break }
    const r = await deps.byQuery(q)
    const hit = accept(r, `maps("${q}")`)
    if (hit) return hit
    // A hard failure (credentials/provider) repeats identically — stop early.
    if (r.error && r.error !== 'no_maps_results') break
  }

  // ── PATH 3: plain web search for a Maps/cid link ──────────────────────────
  if (!outOfTime()) {
    try {
      const urls = await deps.webSearch(deps.webQuery)
      const mapsHit = urls.find((u) => MAPS_LINK.test(u))
      if (mapsHit) {
        const id = await deps.parseMapsUrl(mapsHit)
        if (id.cid || id.placeId) {
          const hit = accept(await deps.byId({ cid: id.cid, placeId: id.placeId }), 'web-search')
          if (hit) return hit
        } else {
          tried.push(`web-search:${id.error || 'no_id'}`)
        }
      } else {
        tried.push('web-search:none')
      }
    } catch (e: any) {
      tried.push(`web-search:error(${(e?.message || '').slice(0, 30)})`)
    }
  }

  // Nothing resolved — the ONLY legitimate "not found".
  const fallback: ReviewsLike = lastFailure
    || { found: false, rating: null, reviewsCount: null, reviews: [], costUSD: 0 }
  L(`UNRESOLVED after all paths — ${tried.join(' · ')}`)
  return {
    reviews: { ...fallback, found: false, costUSD: spent },
    passes: tried.join(' · '),
    resolvedBy: '',
    costUSD: spent,
  }
}
