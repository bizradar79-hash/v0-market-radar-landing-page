/**
 * Google Business rating + reviews via DataForSEO (Business Data API).
 * Same account/auth as the SERP client in ./dataforseo — reviews are just
 * another endpoint family on the provider we already pay for.
 *
 * TWO CALLS, on purpose:
 *  1. my_business_info/live  — LIVE, one request: rating, votes_count, cid,
 *     place_id, address. This is also how we RESOLVE the business identity.
 *  2. reviews/task_post + task_get — review TEXT is task-based (no live
 *     variant exists), so it's posted then polled. We pass the `cid` resolved
 *     in step 1 so the reviews are certainly the same business, not a
 *     same-named one in another city.
 *
 * Cost is read from DataForSEO's own `cost` field on each response — EXACT,
 * never estimated (same discipline as the BrightData request counting).
 */
const BASE = 'https://api.dataforseo.com/v3/business_data/google'
const MY_BUSINESS_LIVE = `${BASE}/my_business_info/live`
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
  const info = await fetchBusinessInfo(name, locationName, id)
  if (!info.found) {
    return { ...info, reviews: [], costUSD: info.costUSD, error: info.error || 'no_google_business_profile' }
  }
  // A business with zero reviews needs no second (billed) call.
  if (!info.reviewsCount) return { ...info, reviews: [], costUSD: info.costUSD }

  // The id from discovery wins; info.cid is the fallback when we looked the
  // business up by keyword and it happened to work.
  const r = await fetchReviewItems(
    { cid: id?.cid || info.cid, placeId: id?.placeId, locationName }, auth,
  )
  return { ...info, reviews: r.reviews, costUSD: info.costUSD + r.costUSD, error: r.error }
}
