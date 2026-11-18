// Google News via DataForSEO — the news engine (replaces Grok web_search).
//
// Endpoint: serp/google/news/live/advanced — one synchronous request (no
// task_post/task_get polling), returns real Google News articles with title,
// publisher, publish time and the article URL. Billed per request (~$0.002),
// versus a Grok web_search call that cost cents per scan.
//
// Same auth as lib/seo/dataforseo.ts (Basic DATAFORSEO_LOGIN:PASSWORD).

const ENDPOINT = 'https://api.dataforseo.com/v3/serp/google/news/live/advanced'

export interface NewsArticle {
  title: string
  url: string            // the real article link — required
  source: string         // publisher name (falls back to domain)
  domain: string
  publishedAt: string | null // ISO 8601
  snippet: string
}

export interface NewsFetchResult {
  ok: boolean
  articles: NewsArticle[]
  costUSD: number
  error?: string
}

function authHeader(): string | null {
  const login = process.env.DATAFORSEO_LOGIN
  const password = process.env.DATAFORSEO_PASSWORD
  if (!login || !password) return null
  return 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64')
}

function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

/** DataForSEO gives "2026-11-17 08:30:00 +00:00"; normalise to ISO or null. */
export function parseDfsTime(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const s = raw.trim().replace(' ', 'T').replace(/ ([+-]\d\d:\d\d)$/, '$1')
  const t = Date.parse(s)
  return isNaN(t) ? null : new Date(t).toISOString()
}

/** Map raw `news_search` items to articles; drops anything without a real http(s) link. */
export function mapNewsItems(rawItems: any[]): NewsArticle[] {
  const out: NewsArticle[] = []
  for (const it of rawItems || []) {
    if (!it || (it.type !== 'news_search' && it.type !== 'top_stories')) continue
    // top_stories nests its articles under items[].
    const list = it.type === 'top_stories' ? (it.items || []) : [it]
    for (const a of list) {
      const url = typeof a?.url === 'string' ? a.url.trim() : ''
      const title = typeof a?.title === 'string' ? a.title.trim() : ''
      if (!/^https?:\/\//i.test(url) || !title) continue
      const domain = a.domain || domainOf(url)
      out.push({
        title,
        url,
        source: (typeof a.source === 'string' && a.source.trim()) || domain,
        domain,
        publishedAt: parseDfsTime(a.timestamp),
        snippet: typeof a.snippet === 'string' ? a.snippet.trim() : '',
      })
    }
  }
  return out
}

/**
 * One live Google News query. Never throws — returns { ok:false, error } so the
 * caller can fall back. `costUSD` is DataForSEO's own billed figure.
 */
export async function fetchGoogleNews(keyword: string, opts?: {
  locationName?: string
  languageCode?: string
  depth?: number
}): Promise<NewsFetchResult> {
  const auth = authHeader()
  if (!auth) return { ok: false, articles: [], costUSD: 0, error: 'missing_credentials' }

  const task = [{
    keyword,
    location_name: opts?.locationName ?? 'Israel',
    language_code: opts?.languageCode ?? 'he',
    depth: opts?.depth ?? 30,
  }]

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify(task),
      signal: AbortSignal.timeout(30_000),
    })
    const data = await res.json().catch(() => ({} as any))
    const costUSD = typeof data?.cost === 'number' ? data.cost : 0
    const taskNode = data?.tasks?.[0]
    if (!res.ok || data?.status_code == null) {
      return { ok: false, articles: [], costUSD, error: `http_${res.status}: ${data?.status_message ?? 'no body'}` }
    }
    if (taskNode?.status_code && taskNode.status_code !== 20000) {
      return { ok: false, articles: [], costUSD, error: `task_${taskNode.status_code}: ${taskNode.status_message ?? ''}` }
    }
    return { ok: true, articles: mapNewsItems(taskNode?.result?.[0]?.items ?? []), costUSD }
  } catch (e: any) {
    return { ok: false, articles: [], costUSD: 0, error: e?.message || 'fetch_failed' }
  }
}

/**
 * Keep recent, de-duplicated articles, newest first, capped. Articles with no
 * publish time are kept after dated ones (Google lists them as current).
 */
export function selectArticles(articles: NewsArticle[], opts: { maxAgeDays: number; limit: number; now?: number }): NewsArticle[] {
  const now = opts.now ?? Date.now()
  const cutoff = now - opts.maxAgeDays * 86400000
  const seenUrl = new Set<string>()
  const seenTitle = new Set<string>()
  const kept = articles.filter((a) => {
    const u = a.url.toLowerCase().replace(/[?#].*$/, '')
    const t = a.title.toLowerCase().replace(/\s+/g, ' ').trim()
    if (seenUrl.has(u) || seenTitle.has(t)) return false
    seenUrl.add(u); seenTitle.add(t)
    if (a.publishedAt && Date.parse(a.publishedAt) < cutoff) return false
    return true
  })
  kept.sort((a, b) => (b.publishedAt ? Date.parse(b.publishedAt) : 0) - (a.publishedAt ? Date.parse(a.publishedAt) : 0))
  return kept.slice(0, opts.limit)
}
