// DataForSEO SERP client — Google Organic, Live Advanced mode.
// Used by generate-seo-ranking to get REAL Google positions instead of asking
// an LLM to guess. Israel / Hebrew / google.co.il by default.

const DFS_ENDPOINT = 'https://api.dataforseo.com/v3/serp/google/organic/live/advanced'

export interface SerpItem {
  rank: number        // rank_absolute (1-based, includes ads/features)
  rankGroup: number   // rank_group (organic-only rank)
  domain: string
  url: string
  title: string
  type: string        // 'organic' | 'paid' | ...
}

export interface DataForSeoResult {
  ok: boolean
  items: SerpItem[]
  error?: string
}

function authHeader(): string | null {
  const login = process.env.DATAFORSEO_LOGIN
  const password = process.env.DATAFORSEO_PASSWORD
  if (!login || !password) return null
  return 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64')
}

/**
 * Run one live Google organic SERP query for Israel/Hebrew and return the
 * ranked items. Throws nothing — returns { ok:false, error } on failure so
 * callers can decide whether to fall back to another provider.
 */
export async function fetchSerp(keyword: string, opts?: {
  locationName?: string
  languageCode?: string
  seDomain?: string
  depth?: number
}): Promise<DataForSeoResult> {
  const auth = authHeader()
  if (!auth) return { ok: false, items: [], error: 'missing_credentials' }

  const task = [{
    keyword,
    location_name: opts?.locationName ?? 'Israel',
    language_code: opts?.languageCode ?? 'he',
    se_domain: opts?.seDomain ?? 'google.co.il',
    device: 'desktop',
    os: 'windows',
    depth: opts?.depth ?? 20,
  }]

  try {
    const res = await fetch(DFS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': auth },
      body: JSON.stringify(task),
    })
    const data = await res.json().catch(() => ({}))

    // DataForSEO returns 200 with a status_code inside the body.
    const statusCode = data?.status_code
    const taskNode = data?.tasks?.[0]
    const taskStatus = taskNode?.status_code

    // 40200/40201 etc. → account / auth problems. 20000 = success.
    if (!res.ok || statusCode == null) {
      return { ok: false, items: [], error: `http_${res.status}: ${data?.status_message ?? 'no body'}` }
    }
    if (taskStatus && taskStatus !== 20000 && taskStatus !== 20100) {
      const msg = taskNode?.status_message ?? data?.status_message ?? `status_${taskStatus}`
      // Surface account-not-verified style errors explicitly.
      return { ok: false, items: [], error: `task_${taskStatus}: ${msg}` }
    }

    const rawItems: any[] = taskNode?.result?.[0]?.items ?? []
    const items: SerpItem[] = rawItems
      .filter((it: any) => it && (it.type === 'organic' || it.type === 'paid') && (it.domain || it.url))
      .map((it: any) => ({
        rank: typeof it.rank_absolute === 'number' ? it.rank_absolute : (it.rank_group ?? 0),
        rankGroup: typeof it.rank_group === 'number' ? it.rank_group : (it.rank_absolute ?? 0),
        domain: (it.domain || '').toLowerCase(),
        url: it.url || '',
        title: it.title || '',
        type: it.type || 'organic',
      }))

    return { ok: true, items }
  } catch (e: any) {
    return { ok: false, items: [], error: e?.message ?? 'fetch_failed' }
  }
}

// ── Google Trends (explore/live) ─────────────────────────────────────────────
// REAL Google Trends interest-over-time, up to 5 keywords in ONE request.
// Replaces the old "ask Grok to guess trends" path: ~$0.002 vs ~15 Grok calls.

const DFS_TRENDS_ENDPOINT = 'https://api.dataforseo.com/v3/keywords_data/google_trends/explore/live'

export interface TrendPoint { date: string; value: number | null }
export type TrendDirection = 'rising' | 'falling' | 'stable'
export type TrendWindowKey = '7d' | '30d' | '90d' | '12m'
export interface TrendWindow {
  window: TrendWindowKey
  direction: TrendDirection
  changePct: number
}
export interface RelatedQuery { query: string; value: number | null }
export interface KeywordTrend {
  keyword: string
  trend: TrendDirection      // default-highlight window (30d) direction
  changePct: number          // default-highlight window (30d) %change
  windows: TrendWindow[]      // 7d / 30d / 90d / 12m breakdown
  series: TrendPoint[]        // interest-over-time, 0-100 (chronological)
}
export interface GoogleTrendsResult {
  ok: boolean
  keywords: KeywordTrend[]
  error?: string
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10) // YYYY-MM-DD
}

const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length

/**
 * Classify the change over a window of the last `days` of the series.
 * Slices the (weekly) 12-month series client-side — no extra API call. Splits
 * the window's points into earlier/recent halves and compares averages. If the
 * window is too short to hold ≥2 points (e.g. 7d on weekly data), it widens to
 * the last 2 valid points so short windows still yield a direction.
 */
function windowChange(series: TrendPoint[], days: number): { direction: TrendDirection; changePct: number } {
  const allValid = series.filter((p): p is { date: string; value: number } => typeof p.value === 'number')
  if (allValid.length < 2) return { direction: 'stable', changePct: 0 }

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  let pts = allValid.filter(p => p.date && new Date(p.date).getTime() >= cutoff)
  if (pts.length < 2) pts = allValid.slice(-2) // widen so short windows still compare

  const vals = pts.map(p => p.value)
  const mid = Math.max(1, Math.floor(vals.length / 2))
  const earlierAvg = avg(vals.slice(0, mid))
  const recentAvg = avg(vals.slice(mid))
  if (earlierAvg <= 0) {
    return recentAvg > 0 ? { direction: 'rising', changePct: 100 } : { direction: 'stable', changePct: 0 }
  }
  const changePct = Math.round(((recentAvg - earlierAvg) / earlierAvg) * 100)
  const direction: TrendDirection = changePct > 10 ? 'rising' : changePct < -10 ? 'falling' : 'stable'
  return { direction, changePct }
}

const WINDOW_DEFS: Array<{ key: TrendWindowKey; days: number }> = [
  { key: '7d', days: 7 },
  { key: '30d', days: 30 },
  { key: '90d', days: 90 },
  { key: '12m', days: 365 },
]

function computeWindows(series: TrendPoint[]): TrendWindow[] {
  return WINDOW_DEFS.map(({ key, days }) => ({ window: key, ...windowChange(series, days) }))
}

/**
 * Fetch REAL Google Trends interest-over-time for up to 5 keywords in ONE call.
 * Israel / Hebrew, last 12 months, web search. For each keyword returns a 0-100
 * series PLUS a multi-window breakdown (7d/30d/90d/12m), all sliced client-side
 * from the single response. Returns { ok:false, error } on failure so callers
 * can fall back (e.g. to the legacy Grok path).
 */
export async function fetchGoogleTrends(keywords: string[], opts?: {
  locationName?: string
  languageName?: string
  months?: number
}): Promise<GoogleTrendsResult> {
  const auth = authHeader()
  if (!auth) return { ok: false, keywords: [], error: 'missing_credentials' }

  const kws = [...new Set(keywords.map(k => (k || '').trim()).filter(Boolean))].slice(0, 5)
  if (kws.length === 0) return { ok: false, keywords: [], error: 'no_keywords' }

  const to = new Date()
  const from = new Date(to.getTime() - (opts?.months ?? 12) * 30 * 24 * 60 * 60 * 1000)

  const task = [{
    keywords: kws,
    location_name: opts?.locationName ?? 'Israel',
    language_name: opts?.languageName ?? 'Hebrew',
    date_from: ymd(from),
    date_to: ymd(to),
    type: 'web',
    item_types: ['google_trends_graph'],
  }]

  try {
    const res = await fetch(DFS_TRENDS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': auth },
      body: JSON.stringify(task),
    })
    const data = await res.json().catch(() => ({}))

    const statusCode = data?.status_code
    const taskNode = data?.tasks?.[0]
    const taskStatus = taskNode?.status_code
    if (!res.ok || statusCode == null) {
      return { ok: false, keywords: [], error: `http_${res.status}: ${data?.status_message ?? 'no body'}` }
    }
    if (taskStatus && taskStatus !== 20000 && taskStatus !== 20100) {
      const msg = taskNode?.status_message ?? data?.status_message ?? `status_${taskStatus}`
      return { ok: false, keywords: [], error: `task_${taskStatus}: ${msg}` }
    }

    const result = taskNode?.result?.[0]
    // The result's keywords array defines the column order of each point's values[].
    const resultKeywords: string[] = Array.isArray(result?.keywords) ? result.keywords : kws
    const items: any[] = Array.isArray(result?.items) ? result.items : []
    const graph = items.find((it: any) => it?.type === 'google_trends_graph')
    const points: any[] = Array.isArray(graph?.data) ? graph.data : []

    if (points.length === 0) {
      return { ok: false, keywords: [], error: 'no_trends_data' }
    }

    const out: KeywordTrend[] = resultKeywords.map((kw, idx) => {
      const series: TrendPoint[] = points.map((pt: any) => {
        const v = Array.isArray(pt?.values) ? pt.values[idx] : null
        // DataForSEO uses a date_from per bucket; fall back to a timestamp.
        const date = pt?.date_from || (pt?.timestamp ? new Date(pt.timestamp * 1000).toISOString().slice(0, 10) : '')
        return { date, value: typeof v === 'number' ? v : null }
      })
      const windows = computeWindows(series)
      const w30 = windows.find(w => w.window === '30d')! // default highlight
      return { keyword: kw, trend: w30.direction, changePct: w30.changePct, windows, series }
    })

    return { ok: true, keywords: out }
  } catch (e: any) {
    return { ok: false, keywords: [], error: e?.message ?? 'fetch_failed' }
  }
}

/**
 * Fetch the top RELATED QUERIES for ONE keyword via Google Trends
 * (google_trends_queries_list). One call per keyword (the queries list endpoint
 * accepts a single keyword). Israel / Hebrew, last 12 months. Returns the top
 * related sub-keywords with their relative popularity (0-100) when available.
 */
export async function fetchRelatedQueries(keyword: string, opts?: {
  locationName?: string
  languageName?: string
  months?: number
  limit?: number
}): Promise<{ ok: boolean; related: RelatedQuery[]; error?: string }> {
  const auth = authHeader()
  if (!auth) return { ok: false, related: [], error: 'missing_credentials' }
  const kw = (keyword || '').trim()
  if (!kw) return { ok: false, related: [], error: 'no_keyword' }

  const to = new Date()
  const from = new Date(to.getTime() - (opts?.months ?? 12) * 30 * 24 * 60 * 60 * 1000)
  const limit = opts?.limit ?? 3

  const task = [{
    keywords: [kw],
    location_name: opts?.locationName ?? 'Israel',
    language_name: opts?.languageName ?? 'Hebrew',
    date_from: ymd(from),
    date_to: ymd(to),
    type: 'web',
    item_types: ['google_trends_queries_list'],
  }]

  try {
    const res = await fetch(DFS_TRENDS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': auth },
      body: JSON.stringify(task),
    })
    const data = await res.json().catch(() => ({}))
    const taskNode = data?.tasks?.[0]
    const taskStatus = taskNode?.status_code
    if (!res.ok || data?.status_code == null) {
      return { ok: false, related: [], error: `http_${res.status}: ${data?.status_message ?? 'no body'}` }
    }
    if (taskStatus && taskStatus !== 20000 && taskStatus !== 20100) {
      return { ok: false, related: [], error: `task_${taskStatus}: ${taskNode?.status_message ?? 'err'}` }
    }

    const items: any[] = Array.isArray(taskNode?.result?.[0]?.items) ? taskNode.result[0].items : []
    const ql = items.find((it: any) => it?.type === 'google_trends_queries_list')
    const top: any[] = Array.isArray(ql?.data?.top) ? ql.data.top : []
    const rising: any[] = Array.isArray(ql?.data?.rising) ? ql.data.rising : []
    const src = top.length ? top : rising
    const related: RelatedQuery[] = src
      .filter((r: any) => r && (r.query || r.keyword))
      .slice(0, limit)
      .map((r: any) => ({ query: String(r.query ?? r.keyword), value: typeof r.value === 'number' ? r.value : null }))

    return { ok: true, related }
  } catch (e: any) {
    return { ok: false, related: [], error: e?.message ?? 'fetch_failed' }
  }
}

// ── Google Ads search volume (REAL monthly numbers) ──────────────────────────
// Replaces Google Trends for keyword intelligence. Returns ABSOLUTE monthly
// search volume per keyword (not a relative 0-100 graph), CPC, competition, and
// a 12-month history — so low-volume Hebrew B2B terms keep real numbers instead
// of being dropped from a normalised multi-term comparison.

const DFS_ADS_VOLUME_ENDPOINT = 'https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live'
const DFS_KW_SUGGESTIONS_ENDPOINT = 'https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_suggestions/live'

export type Competition = 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN'
export interface MonthlySearch { year: number; month: number; searchVolume: number }
export interface SearchVolumeEntry {
  keyword: string
  searchVolume: number          // DataForSEO `search_volume` (avg monthly)
  avgVolume12mo: number          // mean of monthly_searches
  cpc: number                    // avg CPC in account currency (USD by default)
  competition: Competition       // LOW / MEDIUM / HIGH advertiser competition
  competitionIndex: number       // 0-100
  changePct: number              // recent 3-mo avg vs prior 3-mo avg
  direction: TrendDirection
  lowData: boolean               // prior 3-mo avg < 10 → % unreliable
  monthlySearches: MonthlySearch[] // chronological (oldest → newest)
}
export interface SearchVolumeResult { ok: boolean; keywords: SearchVolumeEntry[]; error?: string }

/** Tolerant Hebrew keyword normalization for matching requested ↔ returned keys:
 *  NFC, strip niqqud/cantillation (U+0591–U+05C7), geresh/gershayim/quotes,
 *  punctuation, collapse whitespace, lowercase. Shared so every caller matches
 *  identically and the logic can never diverge between code paths. */
export function normKw(s: string): string {
  return (s || '')
    .normalize('NFC')
    .replace(/[֑-ׇ]/g, '')          // Hebrew niqqud + cantillation
    .replace(/[׳״'"]/g, '')          // geresh / gershayim / quotes
    .replace(/[.,!?;:()[\]{}–—_/\\|-]/g, '')  // punctuation (incl. – —)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Resolve DataForSEO-returned rows back to the requested keywords. Hebrew echoes
 *  can differ in niqqud / geresh / whitespace / plural form, so we use a tolerant
 *  two-pass match: (1) normalized-exact so each row claims its true owner first,
 *  then (2) leftovers via bidirectional substring, then index pairing when row
 *  count == request count (DataForSEO preserves request order). Returns a map of
 *  requested keyword → row index. Generic over the row type (only `keyword` read). */
export function matchKeywordsToRows<T extends { keyword: string }>(
  keywords: string[],
  rows: T[],
): Record<string, number> {
  const used = new Set<number>()
  const matchIdx: Record<string, number> = {}

  // Pass 1 — normalized-exact, so each row goes to its true owner.
  for (const kw of keywords) {
    const nkw = normKw(kw)
    const idx = rows.findIndex((r, i) => !used.has(i) && normKw(r.keyword) === nkw)
    if (idx >= 0) { used.add(idx); matchIdx[kw] = idx }
  }
  // Pass 2 — leftovers: tolerant substring, then index pairing.
  for (const kw of keywords) {
    if (matchIdx[kw] != null) continue
    const nkw = normKw(kw)
    let idx = rows.findIndex((r, i) => {
      if (used.has(i)) return false
      const nr = normKw(r.keyword)
      return !!nr && !!nkw && (nr.includes(nkw) || nkw.includes(nr))
    })
    if (idx === -1 && rows.length === keywords.length) {
      const byOrder = keywords.indexOf(kw)
      if (byOrder >= 0 && !used.has(byOrder)) idx = byOrder
    }
    if (idx >= 0) { used.add(idx); matchIdx[kw] = idx }
  }
  return matchIdx
}

function normCompetition(c: any): Competition {
  const s = typeof c === 'string' ? c.toUpperCase() : ''
  return s === 'LOW' || s === 'MEDIUM' || s === 'HIGH' ? s : 'UNKNOWN'
}

/** Recent 3-mo avg vs prior 3-mo avg. Guards a tiny prior baseline (<10) so we
 *  never emit a meaningless % off near-zero volume. */
function volumeChange(monthly: MonthlySearch[]): { changePct: number; direction: TrendDirection; lowData: boolean } {
  const vals = monthly.map(m => m.searchVolume).filter(v => typeof v === 'number')
  if (vals.length < 4) return { changePct: 0, direction: 'stable', lowData: vals.length === 0 }
  const recent = vals.slice(-3)
  const prior = vals.slice(-6, -3)
  if (prior.length === 0) return { changePct: 0, direction: 'stable', lowData: true }
  const recentAvg = avg(recent)
  const priorAvg = avg(prior)
  if (priorAvg < 10) {
    // Too little prior volume for a reliable %; report direction by raw delta only.
    const dir: TrendDirection = recentAvg > priorAvg + 5 ? 'rising' : recentAvg < priorAvg - 5 ? 'falling' : 'stable'
    return { changePct: 0, direction: dir, lowData: true }
  }
  const changePct = Math.round(((recentAvg - priorAvg) / priorAvg) * 100)
  const direction: TrendDirection = changePct > 10 ? 'rising' : changePct < -10 ? 'falling' : 'stable'
  return { changePct, direction, lowData: false }
}

/**
 * Fetch REAL monthly search volume for a batch of keywords in ONE call.
 * Israel / Hebrew. Google Ads accepts up to 700 keywords per request. Returns
 * { ok:false, error } on failure so the route can fall back to Grok.
 */
export async function fetchSearchVolume(keywords: string[], opts?: {
  locationName?: string
}): Promise<SearchVolumeResult> {
  const auth = authHeader()
  if (!auth) return { ok: false, keywords: [], error: 'missing_credentials' }

  const kws = [...new Set(keywords.map(k => (k || '').trim()).filter(Boolean))].slice(0, 700)
  if (kws.length === 0) return { ok: false, keywords: [], error: 'no_keywords' }

  // NOTE: google_ads/search_volume/live REJECTS BOTH `language_name` AND
  // `language_code` with "task_40501: Invalid Field: ...". This endpoint accepts
  // NO language field — send location_name only (the manual raw test returned
  // valid data, e.g. שטיחים → 18100, with no language field at all).
  const task = [{
    keywords: kws,
    location_name: opts?.locationName ?? 'Israel',
    search_partners: false,
  }]

  try {
    const res = await fetch(DFS_ADS_VOLUME_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': auth },
      body: JSON.stringify(task),
    })
    const data = await res.json().catch(() => ({}))
    // Envelope: { status_code, tasks: [ { status_code, status_message, result: [...] } ] }
    const taskNode = data?.tasks?.[0]
    const taskStatus = taskNode?.status_code
    if (!res.ok || data?.status_code == null) {
      console.warn(`[search_volume] http_${res.status}: ${data?.status_message ?? 'no body'}`)
      return { ok: false, keywords: [], error: `http_${res.status}: ${data?.status_message ?? 'no body'}` }
    }
    if (taskStatus && taskStatus !== 20000 && taskStatus !== 20100) {
      console.warn(`[search_volume] task_${taskStatus}: ${taskNode?.status_message ?? 'err'}`)
      return { ok: false, keywords: [], error: `task_${taskStatus}: ${taskNode?.status_message ?? 'err'}` }
    }

    // Keyword objects live at tasks[0].result[]. Some Keywords-Data responses
    // wrap them one level deeper under result[].items[] — handle BOTH shapes so a
    // valid response is never mis-read as empty.
    const resultArr: any[] = Array.isArray(taskNode?.result) ? taskNode.result : []
    const rows: any[] = resultArr.some((r: any) => r && r.keyword != null)
      ? resultArr
      : resultArr.flatMap((r: any) => Array.isArray(r?.items) ? r.items : [])
    if (rows.length === 0) {
      console.warn(`[search_volume] task ok but no rows (result len ${resultArr.length}) for ${kws.length} kw`)
    }
    const out: SearchVolumeEntry[] = rows
      .filter((r: any) => r && r.keyword)
      .map((r: any) => {
        const monthly: MonthlySearch[] = (Array.isArray(r.monthly_searches) ? r.monthly_searches : [])
          .map((m: any) => ({
            year: Number(m.year) || 0,
            month: Number(m.month) || 0,
            searchVolume: Number(m.search_volume) || 0,
          }))
          .sort((a: MonthlySearch, b: MonthlySearch) => (a.year * 12 + a.month) - (b.year * 12 + b.month))
        const avgVolume12mo = monthly.length ? Math.round(avg(monthly.map(m => m.searchVolume))) : 0
        const { changePct, direction, lowData } = volumeChange(monthly)
        return {
          keyword: String(r.keyword),
          searchVolume: Number(r.search_volume) || 0,
          avgVolume12mo,
          cpc: Number(r.cpc) || 0,
          competition: normCompetition(r.competition),
          competitionIndex: Number(r.competition_index) || 0,
          changePct,
          direction,
          lowData,
          monthlySearches: monthly,
        }
      })

    if (out.length === 0) return { ok: false, keywords: [], error: 'no_volume_data' }
    return { ok: true, keywords: out }
  } catch (e: any) {
    return { ok: false, keywords: [], error: e?.message ?? 'fetch_failed' }
  }
}

export interface KeywordSuggestion { keyword: string; searchVolume: number; cpc: number }

/**
 * Fetch real long-tail KEYWORD SUGGESTIONS for ONE seed keyword via DataForSEO
 * Labs. Israel / Hebrew, ordered by search volume desc. Returns the top
 * `limit` (default 3) suggestions (excluding the seed itself) with real volume.
 */
export async function fetchKeywordSuggestions(seedKeyword: string, opts?: {
  locationName?: string
  languageName?: string
  limit?: number
}): Promise<{ ok: boolean; suggestions: KeywordSuggestion[]; error?: string }> {
  const auth = authHeader()
  if (!auth) return { ok: false, suggestions: [], error: 'missing_credentials' }
  const seed = (seedKeyword || '').trim()
  if (!seed) return { ok: false, suggestions: [], error: 'no_keyword' }
  const limit = opts?.limit ?? 3

  // DIFFERENT endpoint from search_volume: the Labs keyword_suggestions endpoint
  // DOES require a language field and previously accepted `language_name`
  // ('Hebrew') fine. Keep it independent — do NOT remove language here.
  const task = [{
    keyword: seed,
    location_name: opts?.locationName ?? 'Israel',
    language_name: opts?.languageName ?? 'Hebrew',
    include_seed_keyword: false,
    limit: 30,
    order_by: ['keyword_info.search_volume,desc'],
  }]

  try {
    const res = await fetch(DFS_KW_SUGGESTIONS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': auth },
      body: JSON.stringify(task),
    })
    const data = await res.json().catch(() => ({}))
    const taskNode = data?.tasks?.[0]
    const taskStatus = taskNode?.status_code
    if (!res.ok || data?.status_code == null) {
      console.warn(`[kw_suggestions] http_${res.status}: ${data?.status_message ?? 'no body'}`)
      return { ok: false, suggestions: [], error: `http_${res.status}: ${data?.status_message ?? 'no body'}` }
    }
    if (taskStatus && taskStatus !== 20000 && taskStatus !== 20100) {
      console.warn(`[kw_suggestions] task_${taskStatus}: ${taskNode?.status_message ?? 'err'}`)
      return { ok: false, suggestions: [], error: `task_${taskStatus}: ${taskNode?.status_message ?? 'err'}` }
    }

    // Suggestion items live at tasks[0].result[0].items[]. Fall back to scanning
    // every result[] node's items (and to result[] itself) so volume is never
    // dropped due to a slightly different envelope nesting.
    const resultArr: any[] = Array.isArray(taskNode?.result) ? taskNode.result : []
    let items: any[] = resultArr.flatMap((r: any) => Array.isArray(r?.items) ? r.items : [])
    if (items.length === 0) items = resultArr.filter((r: any) => r && (r.keyword || r.keyword_data))
    const seedLc = seed.toLowerCase()
    const suggestions: KeywordSuggestion[] = items
      .map((it: any) => {
        const kw = String(it?.keyword ?? it?.keyword_data?.keyword ?? '').trim()
        // search_volume may sit at item.keyword_info.* or be nested under keyword_data.
        const info = it?.keyword_info ?? it?.keyword_data?.keyword_info ?? {}
        return {
          keyword: kw,
          searchVolume: Number(info.search_volume ?? it?.search_volume) || 0,
          cpc: Number(info.cpc ?? it?.cpc) || 0,
        }
      })
      .filter((s: KeywordSuggestion) => s.keyword && s.keyword.toLowerCase() !== seedLc)
      .sort((a: KeywordSuggestion, b: KeywordSuggestion) => b.searchVolume - a.searchVolume)
      .slice(0, limit)

    return { ok: true, suggestions }
  } catch (e: any) {
    return { ok: false, suggestions: [], error: e?.message ?? 'fetch_failed' }
  }
}

/**
 * Normalise a URL/domain down to its registrable base (handles .co.il etc).
 */
export function baseDomain(input: string): string {
  if (!input) return ''
  let host = input.toLowerCase().trim()
  try {
    host = new URL(host.startsWith('http') ? host : `https://${host}`).hostname
  } catch { /* already a bare domain */ }
  host = host.replace(/^www\d?\./, '')
  const parts = host.split('.')
  if (parts.length >= 3) {
    const last2 = parts.slice(-2).join('.')
    const multi = ['co.il', 'org.il', 'net.il', 'ac.il', 'gov.il', 'co.uk', 'com.au', 'co.nz']
    if (multi.includes(last2)) return parts.slice(-3).join('.')
  }
  return parts.slice(-2).join('.')
}

/**
 * Find the company's organic position for one keyword from a SERP result.
 */
export function findPosition(items: SerpItem[], companyDomain: string): {
  position: number | null
  url: string | null
  found: boolean
} {
  const target = baseDomain(companyDomain)
  if (!target) return { position: null, url: null, found: false }
  // Only consider organic results for "position".
  const organic = items.filter(i => i.type === 'organic')
  for (const it of organic) {
    if (baseDomain(it.domain || it.url) === target) {
      return { position: it.rankGroup || it.rank, url: it.url, found: true }
    }
  }
  return { position: null, url: null, found: false }
}
