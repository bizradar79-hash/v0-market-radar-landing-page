/**
 * Google Business rating + reviews via DataForSEO (Business Data API).
 * Same account/auth as the SERP client in ./dataforseo — reviews are just
 * another endpoint family on the provider we already pay for.
 *
 * TWO CALLS, on purpose:
 *  1. serp/google/maps/live/advanced — LIVE Google MAPS SEARCH. Returns ranked
 *     candidates, each with cid, place_id, title, rating.value, rating.votes_count
 *     and address. This resolves the business AND gives us the standing, so no
 *     separate my_business_info call is needed.
 *  2. reviews/task_post + task_get — review TEXT is task-based (no live
 *     variant exists), so it's posted then polled, keyed on the `cid` resolved
 *     in step 1 — certainly the same business, not a same-named one elsewhere.
 *
 * WHY MAPS SEARCH AND NOT my_business_info: that endpoint is a Knowledge-Panel
 * style EXACT lookup — it resolves one unambiguous entity or returns nothing, and
 * for Hebrew business names it returned task_40102 "No Search Results" even for a
 * business with 119 reviews. Maps search is what a person typing into Google Maps
 * does; Google Maps handles Hebrew natively, and we get a candidate LIST we can
 * match against instead of an all-or-nothing answer.
 *
 * Cost is read from DataForSEO's own `cost` field on each response — EXACT,
 * never estimated (same discipline as the BrightData request counting).
 */
import { norm } from '@/lib/match/hebrew-core'

const BASE = 'https://api.dataforseo.com/v3/business_data/google'
const MY_BUSINESS_LIVE = `${BASE}/my_business_info/live`
/** Google Maps SERP — a real Maps search, not an exact-entity lookup. */
const MAPS_SEARCH_LIVE = 'https://api.dataforseo.com/v3/serp/google/maps/live/advanced'
const REVIEWS_POST = `${BASE}/reviews/task_post`
const REVIEWS_GET = `${BASE}/reviews/task_get`

/**
 * LOCATION — the field that broke this. DataForSEO only accepts locations from
 * ITS OWN catalog, in English, "City,Region,Country" form. We were passing
 * deriveArea().search, which is Hebrew ("ישראל", "דימונה") because it exists to
 * feed prompts — DataForSEO answered "Invalid Field: 'location_name'".
 *
 * So: never send a Hebrew string. Default to the exact literal our WORKING SERP
 * calls have always used ('Israel'), map the handful of Hebrew cities we can
 * translate with confidence, and fall back to country level otherwise — the
 * business name plus the resolved `cid` do the real disambiguation anyway.
 */
const DFS_LOCATION_NAME = process.env.DFS_LOCATION_NAME || 'Israel'
/** Optional numeric override (DataForSEO location_code), if ever preferred. */
const DFS_LOCATION_CODE = Number(process.env.DFS_LOCATION_CODE) || 0

/** Hebrew city → DataForSEO catalog name. Unknown → country level, never Hebrew. */
const CITY_MAP: Record<string, string> = {
  'תל אביב': 'Tel Aviv,Israel', 'תל אביב יפו': 'Tel Aviv,Israel', 'תל־אביב': 'Tel Aviv,Israel',
  'ירושלים': 'Jerusalem,Israel', 'חיפה': 'Haifa,Israel', 'באר שבע': 'Beersheba,Israel',
  'ראשון לציון': 'Rishon LeZion,Israel', 'פתח תקווה': 'Petah Tikva,Israel',
  'נתניה': 'Netanya,Israel', 'אשדוד': 'Ashdod,Israel', 'אשקלון': 'Ashkelon,Israel',
  'רמת גן': 'Ramat Gan,Israel', 'הרצליה': 'Herzliya,Israel', 'רחובות': 'Rehovot,Israel',
  'חולון': 'Holon,Israel', 'בת ים': 'Bat Yam,Israel', 'כפר סבא': 'Kfar Saba,Israel',
  'רעננה': 'Raanana,Israel', 'מודיעין': 'Modiin,Israel', 'אילת': 'Eilat,Israel',
  'טבריה': 'Tiberias,Israel', 'דימונה': 'Dimona,Israel', 'עפולה': 'Afula,Israel',
  'נצרת': 'Nazareth,Israel', 'לוד': 'Lod,Israel', 'רמלה': 'Ramla,Israel',
}

/**
 * Translate our internal (Hebrew) area label into something DataForSEO accepts.
 * Returns the location FIELDS to spread into a task — never a Hebrew value.
 */
export function dfsLocation(area?: string): Record<string, any> {
  if (DFS_LOCATION_CODE) return { location_code: DFS_LOCATION_CODE }
  const a = (area || '').trim()
  // Already an English catalog-style name ("Tel Aviv,Israel") — pass it through.
  if (a && /^[\x20-\x7E]+$/.test(a)) return { location_name: a }
  const mapped = CITY_MAP[a] || CITY_MAP[a.replace(/^ב/, '')]
  return { location_name: mapped || DFS_LOCATION_NAME }
}

/** Reviews are billed per 10 returned — keep the depth at what we actually use. */
const REVIEWS_DEPTH = Number(process.env.DFS_REVIEWS_DEPTH) || 20
const POLL_INTERVAL_MS = Number(process.env.DFS_POLL_INTERVAL_MS) || 10000
const POLL_TIMEOUT_MS = Number(process.env.DFS_POLL_TIMEOUT_MS) || 120000

export interface GoogleReview {
  date: string          // ISO
  rating: number | null // 1..5
  text: string
  author?: string
}
export interface BusinessInfo {
  found: boolean
  title?: string
  address?: string
  cid?: string
  placeId?: string
  rating: number | null
  reviewsCount: number | null
}
export interface ReviewsFetch extends BusinessInfo {
  candidates?: Array<{ title: string; score: number; cid?: string; address?: string }>
  reviews: GoogleReview[]
  /** EXACT — summed from DataForSEO's own `cost` field per task. */
  costUSD: number
  error?: string
}

function authHeader(): string | null {
  const login = process.env.DATAFORSEO_LOGIN
  const password = process.env.DATAFORSEO_PASSWORD
  if (!login || !password) return null
  return 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64')
}
export function isReviewsConfigured(): boolean {
  return !!authHeader()
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** DataForSEO answers 200 with the real status inside; 20000/20100 = fine. */
function taskOf(data: any): { node: any; error?: string; cost: number } {
  const node = data?.tasks?.[0]
  const cost = Number(data?.cost) || Number(node?.cost) || 0
  const st = node?.status_code
  if (st && st !== 20000 && st !== 20100) {
    const msg = String(node?.status_message || '')
    // Make the two failures we actually hit legible instead of a raw code.
    const friendly = /location/i.test(msg)
      ? `מיקום לא נתמך ב-DataForSEO (${msg.slice(0, 80)})`
      : /invalid field/i.test(msg)
        ? `שדה לא תקין בבקשה (${msg.slice(0, 80)})`
        : `task_${st}: ${msg.slice(0, 120)}`
    return { node: null, error: friendly, cost }
  }
  return { node, cost }
}

async function dfsPost(url: string, body: any, auth: string, timeoutMs = 30000) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  return { res, data: await res.json().catch(() => ({})) }
}

// ── Name matching ──────────────────────────────────────────────────────────
// A Maps search returns a RANKED LIST, so we must confirm the top hit is really
// our competitor. Matching on normalized Hebrew tokens (sofit-folded, via
// hebrew-core) rather than raw strings, because "מאי פיננסים" and
// "מאי פיננסים - יועץ משכנתאות" are the same business.
const MIN_NAME_SCORE = Number(process.env.DFS_MIN_NAME_SCORE) || 0.6

export function nameScore(query: string, candidate: string): number {
  const q = norm(query).split(/\s+/).filter((t) => t.length >= 2)
  const c = new Set(norm(candidate).split(/\s+/).filter(Boolean))
  if (!q.length || !c.size) return 0
  const hit = q.filter((t) => c.has(t)).length
  // Share of the QUERY's tokens present in the candidate: a longer candidate
  // title ("… - יועץ משכנתאות בדימונה") must not be penalised for extra words.
  return hit / q.length
}

export interface MapsMatch extends BusinessInfo {
  costUSD: number
  error?: string
  /** Every candidate considered, for diagnosing a wrong / missing match. */
  candidates?: Array<{ title: string; score: number; cid?: string; address?: string }>
}

/**
 * Step 1 — find the business with a real Google Maps search, then CONFIRM the
 * match by name before trusting it. Never throws.
 */
export async function searchBusinessOnMaps(
  name: string, locationName = 'Israel',
): Promise<MapsMatch> {
  const auth = authHeader()
  if (!auth) return { found: false, rating: null, reviewsCount: null, costUSD: 0, error: 'missing_credentials' }
  try {
    const { res, data } = await dfsPost(MAPS_SEARCH_LIVE, [{
      keyword: name.slice(0, 700),
      ...dfsLocation(locationName),
      language_code: 'he',
    }], auth, 45000)
    const { node, error, cost } = taskOf(data)
    if (!res.ok || error) {
      return { found: false, rating: null, reviewsCount: null, costUSD: cost, error: error || `http_${res.status}` }
    }

    const items: any[] = node?.result?.[0]?.items || []
    const scored = items
      .filter((it) => it && (it.title || it.cid))
      .map((it) => ({
        it,
        score: nameScore(name, it.title || ''),
        title: it.title || '',
        cid: it.cid ? String(it.cid) : '',
        address: it.address || '',
      }))
      .sort((a, b) => b.score - a.score)

    const diag = scored.slice(0, 5).map(({ title, score, cid, address }) => ({ title, score: Math.round(score * 100) / 100, cid, address }))
    const best = scored[0]
    // No confident match is an HONEST empty, not a wrong business.
    if (!best || best.score < MIN_NAME_SCORE) {
      return {
        found: false, rating: null, reviewsCount: null, costUSD: cost,
        error: items.length ? 'no_confident_name_match' : 'no_maps_results',
        candidates: diag,
      }
    }
    const it = best.it
    return {
      found: true,
      title: it.title || '',
      address: it.address || '',
      cid: best.cid,
      placeId: it.place_id || '',
      // Maps returns the standing too — no extra call needed.
      rating: typeof it.rating?.value === 'number' ? it.rating.value : null,
      reviewsCount: typeof it.rating?.votes_count === 'number' ? it.rating.votes_count : null,
      costUSD: cost,
      candidates: diag,
    }
  } catch (e: any) {
    return { found: false, rating: null, reviewsCount: null, costUSD: 0, error: (e?.message || 'maps_search_failed').slice(0, 60) }
  }
}

/** Step 1 — resolve the business + its live rating / review count. */
export async function fetchBusinessInfo(
  name: string, locationName = 'Israel', id?: { cid?: string; placeId?: string },
): Promise<BusinessInfo & { costUSD: number; error?: string }> {
  const auth = authHeader()
  if (!auth) return { found: false, rating: null, reviewsCount: null, costUSD: 0, error: 'missing_credentials' }
  try {
    // PREFER the resolved id. DataForSEO's keyword search cannot find Israeli
    // businesses by Hebrew name (task_40102 "No Search Results" even for a
    // business with 119 reviews), but cid/place_id lookups are exact.
    const identity: Record<string, any> = id?.cid
      ? { cid: id.cid }
      : id?.placeId
        ? { place_id: id.placeId }
        : { keyword: name.slice(0, 700) }
    const { res, data } = await dfsPost(MY_BUSINESS_LIVE, [{
      ...identity,
      ...dfsLocation(locationName),
      language_code: 'he',
    }], auth)
    const { node, error, cost } = taskOf(data)
    if (!res.ok || error) {
      return { found: false, rating: null, reviewsCount: null, costUSD: cost, error: error || `http_${res.status}` }
    }
    const item = node?.result?.[0]?.items?.[0]
    // No Google Business profile is a normal outcome, not an error.
    if (!item) return { found: false, rating: null, reviewsCount: null, costUSD: cost }
    return {
      found: true,
      title: item.title || '',
      address: item.address || '',
      cid: item.cid ? String(item.cid) : '',
      placeId: item.place_id || '',
      rating: typeof item.rating?.value === 'number' ? item.rating.value : null,
      reviewsCount: typeof item.rating?.votes_count === 'number' ? item.rating.votes_count : null,
      costUSD: cost,
    }
  } catch (e: any) {
    return { found: false, rating: null, reviewsCount: null, costUSD: 0, error: (e?.message || 'business_info_failed').slice(0, 60) }
  }
}

/** Step 2 — review TEXT. Task-based: post, then poll task_get until ready. */
async function fetchReviewItems(
  opts: { cid?: string; placeId?: string; locationName: string }, auth: string,
): Promise<{ reviews: GoogleReview[]; costUSD: number; error?: string }> {
  let cost = 0
  try {
    // `cid` pins the exact business resolved in step 1; keyword is the fallback.
    const task: Record<string, any> = {
      ...dfsLocation(opts.locationName),
      language_code: 'he',
      depth: REVIEWS_DEPTH,
      sort_by: 'newest', // we only care about the recency window
    }
    // ID ONLY — never fall back to `keyword`, which fails the same way the
    // business search does for Hebrew names.
    if (opts.cid) task.cid = opts.cid
    else if (opts.placeId) task.place_id = opts.placeId
    else return { reviews: [], costUSD: cost, error: 'no_business_id' }

    const posted = await dfsPost(REVIEWS_POST, [task], auth)
    const p = taskOf(posted.data)
    cost += p.cost
    if (p.error) return { reviews: [], costUSD: cost, error: p.error }
    const id = p.node?.id
    if (!id) return { reviews: [], costUSD: cost, error: 'no_task_id' }

    // Poll — there is no live reviews endpoint, so waiting is the only option.
    const deadline = Date.now() + POLL_TIMEOUT_MS
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS)
      const res = await fetch(`${REVIEWS_GET}/${id}`, {
        headers: { Authorization: auth }, signal: AbortSignal.timeout(30000),
      })
      const data = await res.json().catch(() => ({}))
      const node = data?.tasks?.[0]
      cost += Number(data?.cost) || 0
      const st = node?.status_code
      if (st === 40602 || st === 40601) continue // still queued / in progress
      if (st && st !== 20000 && st !== 20100) {
        return { reviews: [], costUSD: cost, error: `task_${st}: ${(node?.status_message || '').slice(0, 120)}` }
      }
      const items: any[] = node?.result?.[0]?.items || []
      const reviews: GoogleReview[] = items
        .filter((it) => it && (it.review_text || it.rating))
        .map((it) => ({
          date: it.timestamp ? new Date(it.timestamp).toISOString() : '',
          rating: typeof it.rating?.value === 'number' ? it.rating.value : null,
          text: (it.review_text || '').slice(0, 600),
          author: it.profile_name || '',
        }))
      return { reviews, costUSD: cost }
    }
    return { reviews: [], costUSD: cost, error: 'reviews_task_timeout' }
  } catch (e: any) {
    return { reviews: [], costUSD: cost, error: (e?.message || 'reviews_failed').slice(0, 60) }
  }
}

/**
 * Full reviews fetch for one competitor. Never throws — a business with no
 * Google profile returns found:false with the reason, not an error state.
 */
export async function fetchGoogleReviews(
  name: string, locationName = 'Israel', id?: { cid?: string; placeId?: string },
): Promise<ReviewsFetch> {
  const auth = authHeader()
  if (!auth) {
    return { found: false, rating: null, reviewsCount: null, reviews: [], costUSD: 0, error: 'missing_credentials' }
  }

  // An explicit id (admin override) skips the search entirely; otherwise a real
  // Google Maps search resolves the business from name + the client's city.
  const info: MapsMatch = id?.cid || id?.placeId
    ? { ...(await fetchBusinessInfo(name, locationName, id)) }
    : await searchBusinessOnMaps(name, locationName)

  if (!info.found) {
    return {
      ...info, reviews: [], costUSD: info.costUSD,
      error: info.error || 'no_google_business_profile',
    }
  }
  // A business with zero reviews needs no second (billed) call.
  if (!info.reviewsCount) return { ...info, reviews: [], costUSD: info.costUSD }

  const r = await fetchReviewItems(
    { cid: id?.cid || info.cid, placeId: id?.placeId || info.placeId, locationName }, auth,
  )
  return { ...info, reviews: r.reviews, costUSD: info.costUSD + r.costUSD, error: r.error }
}
