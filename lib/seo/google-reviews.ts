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
import { norm, deParticle } from '@/lib/match/hebrew-core'

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
  'בני ברק': 'Bnei Brak,Israel', 'גבעתיים': 'Givatayim,Israel', 'ראש העין': 'Rosh Haayin,Israel',
  'אור יהודה': 'Or Yehuda,Israel', 'יהוד': 'Yehud,Israel', 'הוד השרון': 'Hod Hasharon,Israel',
  'ראשל"צ': 'Rishon LeZion,Israel', 'קריית גת': 'Kiryat Gat,Israel', 'נס ציונה': 'Ness Ziona,Israel',
  'בית שמש': 'Beit Shemesh,Israel', 'עכו': 'Acre,Israel', 'קריית שמונה': 'Kiryat Shmona,Israel',
  'אריאל': 'Ariel,Israel', 'שדרות': 'Sderot,Israel', 'ערד': 'Arad,Israel', 'צפת': 'Safed,Israel',
}

/** The DataForSEO location a given area maps to — used to compare passes. */
export function mappedLocationLabel(area?: string): string {
  const loc = dfsLocation(area)
  return String(loc.location_name || loc.location_code || 'Israel')
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
  viaTopResult?: boolean
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

/**
 * Words that carry no brand identity — a Google listing title is almost always
 * "<brand> <what they do> <where>", and only the brand identifies the business.
 * Matching on these would let "לימון" match any consultancy in the country.
 */
// NOTE: these are written in normal Hebrew but MUST be compared in normalized
// form — norm() folds final letters (פיננסים → פיננסימ), so a raw list would
// never match a single entry. GENERIC_TITLE_TOKENS below is built through norm().
const GENERIC_TITLE_RAW = [
  'ייעוץ', 'יעוץ', 'יועץ', 'יועצי', 'יועצים', 'משכנתא', 'משכנתאות', 'פיננסי', 'פיננסים',
  'חברת', 'חברה', 'קבוצת', 'קבוצה', 'בעמ', 'בע', 'מ', 'ltd', 'inc', 'group', 'ושות',
  'סוכנות', 'משרד', 'משרדי', 'שירותי', 'שירות', 'מרכז', 'בית', 'סטודיו', 'עסק',
  'ישראל', 'תל', 'אביב', 'ירושלים', 'חיפה', 'דימונה', 'the', 'and', 'of',
]
const GENERIC_TITLE_TOKENS = new Set(GENERIC_TITLE_RAW.map((t) => norm(t)).filter(Boolean))

const tokensOf = (s: string) => norm(s).split(/\s+/).filter(Boolean)
/**
 * The identifying words of a name: everything that isn't boilerplate.
 * Prefixed particles are stripped first (ו/ה/ב/ל/מ/ש/כ), otherwise "ופיננסים"
 * survives as a "brand" word and dilutes the real one.
 */
export function brandTokens(name: string): string[] {
  const all = tokensOf(name).filter((t) => t.length >= 2)
  // NEVER apply deParticle to the token itself — a real brand can legitimately
  // start with a particle letter ("לימון" would become "ימון"). We only use the
  // de-particled form as an ADDITIONAL variant when comparing.
  const brand = all.filter((t) => !GENERIC_TITLE_TOKENS.has(t) && !GENERIC_TITLE_TOKENS.has(deParticle(t)))
  // A name made ENTIRELY of generic words still has to match on something.
  return brand.length ? brand : all
}

/** A token matches a candidate if either form (as-is or de-particled) appears. */
function tokenHits(token: string, candidateTokens: Set<string>, candidateText: string): boolean {
  const bare = deParticle(token)
  return candidateTokens.has(token) || candidateTokens.has(bare) ||
    candidateText.includes(token) || (bare.length >= 3 && candidateText.includes(bare))
}

/**
 * How well a Maps result matches the competitor we asked for.
 *
 * The old rule demanded that EVERY query token appear in the title, which is
 * near-exact matching: "לימון" vs "לימון ייעוץ משכנתאות" passed, but any name
 * whose stored form differs slightly from the listing ("מסלולים" stored,
 * "מסלולים - ייעוץ משכנתאות בע\"מ" listed, or vice versa) scored below the
 * threshold and every real business was rejected.
 *
 * Now: substring containment either way, or brand-token overlap. Extra words in
 * the listing ("ייעוץ משכנתאות", "בע\"מ", a city suffix) cost nothing.
 */
export function nameScore(query: string, candidate: string): number {
  const q = norm(query)
  const c = norm(candidate)
  if (!q || !c) return 0
  if (q === c) return 1

  // Containment in either direction is a strong signal: the listing name is the
  // stored name plus descriptors, or the stored name is the listing plus ours.
  if (c.includes(q) || q.includes(c)) return 1

  const qb = brandTokens(query)
  if (!qb.length) return 0
  // Compare BRAND words to the candidate's full text: descriptors on either
  // side are irrelevant, only the identifying words have to line up.
  const cAll = new Set(tokensOf(candidate))
  const hits = qb.filter((t) => tokenHits(t, cAll, c)).length
  return hits / qb.length
}

/**
 * HARD GUARD against grabbing an unrelated business: at least one identifying
 * brand word of the competitor name must literally appear in the listing title.
 * Loosening the score without this would let "לימון" match "תפוז ייעוץ".
 */
export function shareBrandToken(query: string, candidate: string): boolean {
  const cTokens = new Set(tokensOf(candidate))
  const cJoined = norm(candidate)
  return brandTokens(query).some((t) => tokenHits(t, cTokens, cJoined))
}

/**
 * The keyword to search Maps with. Generic words steer a Maps query toward the
 * whole category — searching "לימון ייעוץ משכנתאות" surfaces the mortgage-advisor
 * pack, while "לימון" finds the business. So when a name has a distinctive brand
 * word we search on THAT, and still match the full name against the results.
 */
export function searchKeyword(name: string, industryContext?: string): string {
  const brand = brandTokens(name)
  const all = norm(name).split(/\s+/).filter(Boolean)
  // Only narrow when stripping actually removed generic noise and left something
  // substantial; otherwise the original name is the better query.
  if (!brand.length || brand.length === all.length) return withContext(name.trim(), industryContext)
  const kept = name.trim().split(/\s+/).filter((w) => {
    const n = norm(w)
    return brand.some((b) => n === b || n.includes(b) || b.includes(n))
  })
  return withContext(kept.length ? kept.join(' ') : name.trim(), industryContext)
}

/**
 * Append the BUSINESS-TYPE context to a Maps query.
 *
 * A bare brand word is far too broad on Google Maps: "לימון" returns cafés,
 * juice bars and shops across the country and the mortgage firm never makes the
 * result depth, so every candidate fails the brand check and we reported
 * "no confident match". "ידע" happened to work only because it is a rarer word.
 * A competitor shares the CLIENT's industry by definition, so the client's own
 * industry term is a safe, free disambiguator: "לימון" → "לימון משכנתאות".
 */
export function withContext(query: string, industryContext?: string): string {
  const ctx = (industryContext || '').trim()
  if (!ctx) return query
  const q = norm(query)
  // Don't repeat a word the name already carries.
  const add = ctx.split(/\s+/).filter((w) => w.trim() && !q.includes(norm(w))).slice(0, 2)
  return add.length ? `${query} ${add.join(' ')}`.trim() : query
}

/** Bare hostname, for comparing a Maps listing's site to a known website. */
export function hostOf(url?: string): string {
  if (!url) return ''
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname
      .replace(/^www\./i, '').toLowerCase()
  } catch { return '' }
}

export interface MapsMatch extends BusinessInfo {
  costUSD: number
  error?: string
  /** True when the match came from Google's ranking rather than a name match. */
  viaTopResult?: boolean
  /** Every candidate considered, for diagnosing a wrong / missing match. */
  candidates?: Array<{ title: string; score: number; cid?: string; address?: string }>
}

/**
 * Step 1 — find the business with a real Google Maps search, then CONFIRM the
 * match by name before trusting it. Never throws.
 */
export async function searchBusinessOnMaps(
  name: string, locationName = 'Israel', keywordOverride?: string,
  /** The competitor's known website — an exact domain match beats any name score. */
  knownWebsite?: string,
  /**
   * TRUST GOOGLE'S RANKING. When the query is specific (name + industry + city),
   * the top Maps hit IS the business — that's what a human clicking the first
   * result gets. Without this, a strict similarity gate kept rejecting real
   * businesses ("לימון") because their listing title differed from the stored
   * name. With it, we only fall back to the top result when nothing scored.
   */
  trustTopResult?: boolean,
): Promise<MapsMatch> {
  const auth = authHeader()
  if (!auth) return { found: false, rating: null, reviewsCount: null, costUSD: 0, error: 'missing_credentials' }
  try {
    const task = {
      keyword: (keywordOverride || name).slice(0, 700),
      ...dfsLocation(locationName),
      language_code: 'he',
    }
    console.log(`[COMPETITOR-INTEL][${name}] DFS maps/live/advanced REQ ${JSON.stringify(task)}`)
    const { res, data } = await dfsPost(MAPS_SEARCH_LIVE, [task], auth, 45000)
    const { node, error, cost } = taskOf(data)
    if (!res.ok || error) {
      return { found: false, rating: null, reviewsCount: null, costUSD: cost, error: error || `http_${res.status}` }
    }

    const knownHost = hostOf(knownWebsite)
    const items: any[] = node?.result?.[0]?.items || []
    console.log(`[COMPETITOR-INTEL][${name}] DFS maps RES http=${res.status} items=${items.length} titles=${JSON.stringify(items.slice(0, 6).map((i: any) => i?.title))}`)
    const scored = items
      .filter((it) => it && (it.title || it.cid))
      .map((it) => ({
        it,
        score: nameScore(name, it.title || ''),
        // A candidate without a shared brand word can never be selected, no
        // matter how the score lands.
        brandOk: shareBrandToken(name, it.title || ''),
        // STRONGEST signal available: the listing points at the same website we
        // already discovered for this competitor. Identity, not similarity.
        domainMatch: !!knownHost && hostOf(it.domain || it.url || it.website) === knownHost,
        votes: typeof it.rating?.votes_count === 'number' ? it.rating.votes_count : 0,
        title: it.title || '',
        cid: it.cid ? String(it.cid) : '',
        address: it.address || '',
      }))
      // Among acceptable candidates prefer the MOST-REVIEWED one: on Google a
      // real business outweighs a stub or duplicate listing of the same name.
      .sort((a, b) => (Number(b.domainMatch) - Number(a.domainMatch)) || (b.score - a.score) || (b.votes - a.votes))

    // A domain match is accepted on its own; otherwise the brand guard + score
    // still gate, and among those the most-reviewed listing wins.
    const acceptable = scored
      .filter((x) => x.domainMatch || (x.brandOk && x.score >= MIN_NAME_SCORE))
      .sort((a, b) => (Number(b.domainMatch) - Number(a.domainMatch)) || (b.votes - a.votes) || (b.score - a.score))

    const diag = scored.slice(0, 5).map(({ title, score, cid, address }) => ({ title, score: Math.round(score * 100) / 100, cid, address }))
    // 1st choice: a domain match or a confident name match.
    // 2nd choice (trustTopResult): Google's own #1 result for a specific
    // name+industry+city query. Finding the right PAGE beats string similarity.
    const best = acceptable[0]
      || (trustTopResult && scored.length ? scored[0] : undefined)
    if (!best) {
      return {
        found: false, rating: null, reviewsCount: null, costUSD: cost,
        error: 'no_maps_results',
        candidates: diag,
      }
    }
    const viaTopResult = !acceptable.length
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
      // Recorded so a top-result acceptance is never mistaken for an exact match.
      viaTopResult,
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
    // PREFER the resolved id. DataForSEO's plain keyword search cannot find
    // Israeli businesses by Hebrew name (task_40102 "No Search Results" even for
    // a business with 119 reviews), but an id lookup is exact.
    //
    // CRITICAL SHAPE (this endpoint only): my_business_info/live takes NO `cid`
    // or `place_id` field — the identifier goes INSIDE `keyword`, prefixed:
    //   keyword: "cid:194604053573767737"  /  keyword: "place_id:GhIJ…"
    // Sending them as top-level fields left the request with no `keyword` at
    // all, which the API reports as: Invalid Field: 'keyword'. That is why
    // reviews broke as soon as the first cid got cached.
    // (The reviews task_post endpoint is different — there cid/place_id ARE
    // their own fields. See fetchReviewItems.)
    const identity: Record<string, any> = id?.cid
      ? { keyword: `cid:${id.cid}` }
      : id?.placeId
        ? { keyword: `place_id:${id.placeId}` }
        : { keyword: name.slice(0, 700) }
    const mbTask = { ...identity, ...dfsLocation(locationName), language_code: 'he' }
    console.log(`[COMPETITOR-INTEL][${name}] DFS my_business_info REQ ${JSON.stringify(mbTask)}`)
    const { res, data } = await dfsPost(MY_BUSINESS_LIVE, [mbTask], auth)
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

    console.log(`[COMPETITOR-INTEL] DFS reviews/task_post REQ ${JSON.stringify(task)}`)
    const posted = await dfsPost(REVIEWS_POST, [task], auth)
    const p = taskOf(posted.data)
    cost += p.cost
    if (p.error) return { reviews: [], costUSD: cost, error: p.error }
    const id = p.node?.id
    console.log(`[COMPETITOR-INTEL] DFS reviews/task_post RES task=${id || '(none)'} err=${p.error || '-'}`)
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
      console.log(`[COMPETITOR-INTEL] DFS reviews/task_get RES status=${st} items=${items.length}`)
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
  id?: { cid?: string; placeId?: string },
  keywordOverride?: string,
  knownWebsite?: string,
  trustTopResult?: boolean,
): Promise<ReviewsFetch> {
  const auth = authHeader()
  if (!auth) {
    return { found: false, rating: null, reviewsCount: null, reviews: [], costUSD: 0, error: 'missing_credentials' }
  }

  // An explicit id (admin override) skips the search entirely; otherwise a real
  // Google Maps search resolves the business from name + the client's city.
  const info: MapsMatch = id?.cid || id?.placeId
    ? { ...(await fetchBusinessInfo(name, locationName, id)) }
    : await searchBusinessOnMaps(name, locationName, keywordOverride, knownWebsite, trustTopResult)

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
