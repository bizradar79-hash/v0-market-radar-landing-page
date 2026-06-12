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
export interface KeywordTrend {
  keyword: string
  trend: 'rising' | 'falling' | 'stable'
  changePct: number          // recent-half avg vs earlier-half avg, %
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

/** Classify a 0-100 series into rising/falling/stable by comparing halves. */
function computeTrend(series: TrendPoint[]): { trend: 'rising' | 'falling' | 'stable'; changePct: number } {
  const vals = series.map(p => p.value).filter((v): v is number => typeof v === 'number')
  if (vals.length < 2) return { trend: 'stable', changePct: 0 }
  const mid = Math.floor(vals.length / 2)
  const earlier = vals.slice(0, mid)
  const recent = vals.slice(mid)
  const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length
  const earlierAvg = avg(earlier)
  const recentAvg = avg(recent)
  if (earlierAvg <= 0) {
    // grew from a zero baseline → rising if any recent interest, else stable
    return recentAvg > 0 ? { trend: 'rising', changePct: 100 } : { trend: 'stable', changePct: 0 }
  }
  const changePct = ((recentAvg - earlierAvg) / earlierAvg) * 100
  const trend = changePct > 10 ? 'rising' : changePct < -10 ? 'falling' : 'stable'
  return { trend, changePct: Math.round(changePct) }
}

/**
 * Fetch REAL Google Trends interest-over-time for up to 5 keywords in ONE call.
 * Israel / Hebrew, last 12 months, web search. Returns per-keyword series + a
 * rising/falling/stable classification. Returns { ok:false, error } on failure
 * so callers can fall back (e.g. to the legacy Grok path).
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
      const { trend, changePct } = computeTrend(series)
      return { keyword: kw, trend, changePct, series }
    })

    return { ok: true, keywords: out }
  } catch (e: any) {
    return { ok: false, keywords: [], error: e?.message ?? 'fetch_failed' }
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
