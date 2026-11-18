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
  /** First raw items exactly as returned — surfaced in the route's steps for diagnosis. */
  rawSample?: any[]
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

// Google News (Hebrew) gives no machine timestamp — only `time_published` text
// like "29 בדצמ׳ 2025", "12 בנוב׳", "לפני 3 ימים", "לפני שעתיים", "אתמול".
const HE_MONTHS: Array<[RegExp, number]> = [
  [/^ינו/, 0], [/^פבר/, 1], [/^מרץ|^מרס/, 2], [/^אפר/, 3], [/^מאי/, 4], [/^יונ/, 5],
  [/^יול/, 6], [/^אוג/, 7], [/^ספט/, 8], [/^אוק/, 9], [/^נוב/, 10], [/^דצמ/, 11],
]

/** Parse Google's Hebrew `time_published` into ISO (null if unrecognised). */
export function parseHebrewTime(raw: unknown, now = Date.now()): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const s = raw.trim().replace(/[׳']/g, '')
  const H = 3600000, D = 86400000
  if (/^אתמול/.test(s)) return new Date(now - D).toISOString()
  if (/^(היום|עכשיו|לפני רגע)/.test(s)) return new Date(now).toISOString()
  const rel = s.match(/^לפני\s+(\d+)?\s*(דקה|דקות|שעה|שעות|שעתיים|יום|ימים|יומיים|שבוע|שבועות|שבועיים|חודש|חודשים)/)
  if (rel) {
    const n = rel[1] ? Number(rel[1]) : 1
    const unit = rel[2]
    const ms = /דק/.test(unit) ? n * 60000
      : unit === 'שעתיים' ? 2 * H : /שע/.test(unit) ? n * H
      : unit === 'יומיים' ? 2 * D : /^י/.test(unit) ? n * D
      : unit === 'שבועיים' ? 14 * D : /שבוע/.test(unit) ? n * 7 * D
      : n * 30 * D
    return new Date(now - ms).toISOString()
  }
  const abs = s.match(/^(\d{1,2})\s+ב?(\S+)(?:\s+(\d{4}))?/)
  if (abs) {
    const month = HE_MONTHS.find(([re]) => re.test(abs[2]))?.[1]
    if (month == null) return null
    const nowD = new Date(now)
    let year = abs[3] ? Number(abs[3]) : nowD.getUTCFullYear()
    let t = Date.UTC(year, month, Number(abs[1]), 12)
    if (!abs[3] && t > now + D) t = Date.UTC(year - 1, month, Number(abs[1]), 12) // "12 בנוב׳" in Jan = last year
    return isNaN(t) ? null : new Date(t).toISOString()
  }
  return null
}

const SOURCE_NAMES: Record<string, string> = {
  'ynet.co.il': 'ynet', 'haaretz.co.il': 'הארץ', 'themarker.com': 'TheMarker', 'globes.co.il': 'גלובס',
  'calcalist.co.il': 'כלכליסט', 'mako.co.il': 'mako', 'walla.co.il': 'וואלה', 'maariv.co.il': 'מעריב',
  'n12.co.il': 'N12', 'kan.org.il': 'כאן', 'israelhayom.co.il': 'ישראל היום', 'bizportal.co.il': 'ביזפורטל',
  'ice.co.il': 'ice', 'srugim.co.il': 'סרוגים', 'inn.co.il': 'ערוץ 7', 'kikar.co.il': 'כיכר השבת',
  'bhol.co.il': 'בחדרי חרדים', 'davar1.co.il': 'דבר', 'zman.co.il': 'זמן ישראל', 'geektime.co.il': 'גיקטיים',
  'funder.co.il': 'פאנדר', 'i24news.tv': 'i24NEWS', 'i24news.co.il': 'i24NEWS', 'haipo.co.il': 'חי פה', 'news1.co.il': 'News1', 'timesofisrael.com': 'The Times of Israel', 'jpost.com': 'Jerusalem Post',
}

/** Readable publisher name for a domain (ynet.co.il → "ynet"); falls back to the domain. */
export function sourceName(domain: string): string {
  const d = domain.replace(/^www\./, '').toLowerCase()
  const hit = Object.keys(SOURCE_NAMES).find(k => d === k || d.endsWith('.' + k))
  return hit ? SOURCE_NAMES[hit] : d
}

const isGoogleHost = (url: string) => /(^|\.)google\.[a-z.]+$/i.test(domainOf(url))

/**
 * Google News links are google.com/goto?url=<id> redirects. Follow them (no
 * page fetch — only the redirect hops) to get the real article URL + publisher.
 * Never throws; on failure the Google link is kept (it still opens the article).
 */
export async function resolveArticleLinks(articles: NewsArticle[], timeoutMs = 8000): Promise<NewsArticle[]> {
  const follow = async (start: string): Promise<string | null> => {
    let cur = start
    for (let hop = 0; hop < 4; hop++) {
      const r = await fetch(cur, {
        redirect: 'manual',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36' },
        signal: AbortSignal.timeout(timeoutMs),
      })
      const loc = r.headers.get('location')
      if (!loc) return null
      cur = new URL(loc, cur).href
      if (!isGoogleHost(cur)) return cur
    }
    return null
  }
  return Promise.all(articles.map(async (a) => {
    if (!isGoogleHost(a.url)) return a
    // One retry: Google's redirect hop is occasionally slow from serverless IPs.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const real = await follow(a.url)
        if (real) {
          const domain = domainOf(real)
          return { ...a, url: real, domain, source: sourceName(domain) }
        }
      } catch { /* timeout / network — retry once, then keep the Google link */ }
    }
    return a
  }))
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
        source: (typeof a.source === 'string' && a.source.trim()) || sourceName(domain),
        domain,
        publishedAt: parseDfsTime(a.timestamp) ?? parseHebrewTime(a.time_published),
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
    const rawItems: any[] = taskNode?.result?.[0]?.items ?? []
    return { ok: true, articles: mapNewsItems(rawItems), costUSD, rawSample: rawItems.slice(0, 2) }
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
    // Full URL incl. query: Google News article links are google.com/goto?url=<id>
    // and differ ONLY in the query — stripping it collapsed 39 articles into 1.
    const u = a.url.toLowerCase().replace(/#.*$/, '')
    const t = a.title.toLowerCase().replace(/\s+/g, ' ').trim()
    if (seenUrl.has(u) || seenTitle.has(t)) return false
    seenUrl.add(u); seenTitle.add(t)
    if (a.publishedAt && Date.parse(a.publishedAt) < cutoff) return false
    return true
  })
  kept.sort((a, b) => (b.publishedAt ? Date.parse(b.publishedAt) : 0) - (a.publishedAt ? Date.parse(a.publishedAt) : 0))
  return kept.slice(0, opts.limit)
}
