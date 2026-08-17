// BrightData server client — scrape a URL to markdown, or run a SERP search.
// Same shape as our other external clients (lib/seo/dataforseo): key from env,
// graceful failure (never throws into the caller), one retry, hard timeout.
//
// Used ONLY by the isolated admin competitor-intel dev sandbox. Every response
// is NOISY MARKDOWN TEXT (not clean JSON) — the LLM summarizer does the parsing.

const API_URL = 'https://api.brightdata.com/request'
const SEARCH_URL = 'https://api.brightdata.com/request'
const TIMEOUT_MS = Number(process.env.BRIGHTDATA_TIMEOUT_MS) || 45000
// Unlocker zone that renders JS + returns markdown. Override per account.
const ZONE = process.env.BRIGHTDATA_ZONE || 'web_unlocker1'

export type SourceStatus = 'ok' | 'empty' | 'failed' | 'skipped'

export interface ScrapeResult {
  ok: boolean
  status: SourceStatus
  /** Raw markdown text as returned by BrightData (noisy — nav, menus, etc.). */
  text: string
  error?: string
  url?: string
}

function token(): string | null {
  const t = process.env.BRIGHTDATA_API_TOKEN
  // Treat placeholders as missing so local builds/dev fail gracefully.
  if (!t || t.length < 20 || /placeholder|your[-_]?token|changeme/i.test(t)) return null
  return t
}

/** True when a usable key is configured (UI can show a clear "not configured"). */
export function isBrightDataConfigured(): boolean {
  return token() !== null
}

async function postOnce(body: any, signal: AbortSignal): Promise<{ ok: boolean; text: string; status: number }> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token()}`,
    },
    body: JSON.stringify(body),
    signal,
  })
  const text = await res.text().catch(() => '')
  return { ok: res.ok, text, status: res.status }
}

/** One attempt with its own timeout — so a hung request can never block a run. */
async function attempt(body: any): Promise<{ ok: boolean; text: string; status: number }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    return await postOnce(body, ctrl.signal)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Scrape any URL → raw markdown. Retries ONCE on failure/timeout (BrightData
 * occasionally times out on social pages), then returns a clear per-source error.
 * NEVER throws — each source must fail independently without blocking the others.
 */
export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  const clean = (url || '').trim()
  if (!clean) return { ok: false, status: 'skipped', text: '', error: 'no_url' }
  if (!/^https?:\/\//i.test(clean)) return { ok: false, status: 'skipped', text: '', error: 'invalid_url', url: clean }
  if (!token()) return { ok: false, status: 'failed', text: '', error: 'missing_brightdata_token', url: clean }

  const body = { zone: ZONE, url: clean, format: 'raw', data_format: 'markdown' }

  for (let i = 0; i < 2; i++) {
    try {
      const r = await attempt(body)
      if (r.ok) {
        const text = (r.text || '').trim()
        if (!text) return { ok: false, status: 'empty', text: '', error: 'empty_response', url: clean }
        return { ok: true, status: 'ok', text, url: clean }
      }
      if (i === 1) return { ok: false, status: 'failed', text: '', error: `http_${r.status}: ${r.text.slice(0, 160)}`, url: clean }
    } catch (e: any) {
      const msg = e?.name === 'AbortError' ? `timeout_${TIMEOUT_MS}ms` : (e?.message || 'fetch_failed')
      if (i === 1) return { ok: false, status: 'failed', text: '', error: msg, url: clean }
    }
  }
  return { ok: false, status: 'failed', text: '', error: 'unknown', url: clean }
}

export interface SearchHit { title: string; url: string }

/**
 * SERP search — used to AUTO-DISCOVER a competitor's profile URL when the admin
 * didn't provide one (e.g. "<name> instagram"). Returns links parsed out of the
 * markdown SERP. Best-effort; empty array on any failure.
 */
export async function searchWeb(query: string, limit = 10): Promise<SearchHit[]> {
  const q = (query || '').trim()
  if (!q || !token()) return []
  const body = {
    zone: ZONE,
    url: `https://www.google.com/search?q=${encodeURIComponent(q)}&num=${limit}&hl=he&gl=il`,
    format: 'raw',
    data_format: 'markdown',
  }
  try {
    const r = await attempt(body)
    if (!r.ok || !r.text) return []
    // Markdown links: [title](url) — keep real http(s) targets, drop google's own.
    const hits: SearchHit[] = []
    const seen = new Set<string>()
    const re = /\[([^\]]{2,120})\]\((https?:\/\/[^)\s]+)\)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(r.text)) !== null) {
      const url = m[2]
      if (/google\.|gstatic|googleusercontent|\/search\?/i.test(url)) continue
      if (seen.has(url)) continue
      seen.add(url)
      hits.push({ title: m[1].trim(), url })
      if (hits.length >= limit) break
    }
    return hits
  } catch {
    return []
  }
}

/** Find the best profile URL for a competitor on a given platform host. */
export async function discoverProfileUrl(name: string, hostFragment: string): Promise<string> {
  const hits = await searchWeb(`${name} ${hostFragment}`)
  const hit = hits.find((h) => h.url.toLowerCase().includes(hostFragment.toLowerCase()))
  return hit?.url || ''
}
