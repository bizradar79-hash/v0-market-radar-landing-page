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
    return { node: null, error: `task_${st}: ${(node?.status_message || '').slice(0, 120)}`, cost }
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
  name: string, locationName = 'Israel',
): Promise<BusinessInfo & { costUSD: number; error?: string }> {
  const auth = authHeader()
  if (!auth) return { found: false, rating: null, reviewsCount: null, costUSD: 0, error: 'missing_credentials' }
  try {
    const { res, data } = await dfsPost(MY_BUSINESS_LIVE, [{
      keyword: name.slice(0, 700),
      location_name: locationName,
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
  opts: { cid?: string; keyword: string; locationName: string }, auth: string,
): Promise<{ reviews: GoogleReview[]; costUSD: number; error?: string }> {
  let cost = 0
  try {
    // `cid` pins the exact business resolved in step 1; keyword is the fallback.
    const task: Record<string, any> = {
      location_name: opts.locationName,
      language_code: 'he',
      depth: REVIEWS_DEPTH,
      sort_by: 'newest', // we only care about the recency window
    }
    if (opts.cid) task.cid = opts.cid
    else task.keyword = opts.keyword.slice(0, 700)

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
  name: string, locationName = 'Israel',
): Promise<ReviewsFetch> {
  const auth = authHeader()
  if (!auth) {
    return { found: false, rating: null, reviewsCount: null, reviews: [], costUSD: 0, error: 'missing_credentials' }
  }
  const info = await fetchBusinessInfo(name, locationName)
  if (!info.found) {
    return { ...info, reviews: [], costUSD: info.costUSD, error: info.error || 'no_google_business_profile' }
  }
  // A business with zero reviews needs no second (billed) call.
  if (!info.reviewsCount) return { ...info, reviews: [], costUSD: info.costUSD }

  const r = await fetchReviewItems({ cid: info.cid, keyword: name, locationName }, auth)
  return { ...info, reviews: r.reviews, costUSD: info.costUSD + r.costUSD, error: r.error }
}
