// OpenAI engine for GEO ranking — asks ChatGPT (Responses API + web_search)
// which businesses it recommends for a query, so customers can see their real
// standing inside ChatGPT. Uses a cheap model by default (gpt-5-mini).

import type { ScanCostCollector } from '@/lib/scan/cost-tracker'

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/responses'

// Cheap default; override via env if the account doesn't have gpt-5-mini.
const OPENAI_GEO_MODEL = process.env.OPENAI_GEO_MODEL || 'gpt-5-mini'
// Responses API web search tool name. Newer accounts: 'web_search';
// older: 'web_search_preview'. Configurable for safety.
const OPENAI_WEB_SEARCH_TOOL = process.env.OPENAI_WEB_SEARCH_TOOL || 'web_search'
// TIME fix — hard per-engine timeout. OpenAI's web_search can hang for minutes;
// with no cap it dragged the whole GEO route to its maxDuration, got killed
// mid-flight (504), and the scan's chain-resume then RE-RAN GEO, double-billing.
// Cap each call so one slow engine degrades to "empty" instead of nuking GEO.
const OPENAI_GEO_TIMEOUT_MS = Math.max(
  5_000,
  parseInt(process.env.GEO_ENGINE_TIMEOUT_MS || '30000', 10) || 30_000,
)

/**
 * Extract concatenated output_text from a Responses API payload.
 */
export function extractOpenAIText(data: any): string {
  if (typeof data?.output_text === 'string' && data.output_text) return data.output_text
  const output = Array.isArray(data?.output) ? data.output : []
  return output
    .filter((item: any) => item.type === 'message')
    .flatMap((item: any) => item.content ?? [])
    .filter((c: any) => c.type === 'output_text')
    .map((c: any) => c.text)
    .join('')
}

// ── Tolerant business-list parser ──────────────────────────────────────────
// Browsing models rarely obey "return strict JSON": they wrap JSON in markdown,
// prepend prose/citations, or answer as a numbered/bulleted list. This parser
// tries, in order: (1) a JSON object with a `results` array, (2) a bare JSON
// array, (3) a prose numbered/bulleted list. Only returns [] when truly nothing
// is parseable — so a good answer is never silently dropped.

function pickName(item: any): string {
  return String(
    item?.name || item?.title || item?.business || item?.company ||
    item?.businessName || item?.company_name || '',
  ).trim()
}

function pickUrl(item: any): string {
  const u = String(item?.url || item?.website || item?.link || item?.domain || '').trim()
  if (!u) return ''
  return /^https?:\/\//i.test(u) ? u : `https://${u.replace(/^\/+/, '')}`
}

function normalizeResultList(arr: any[]): any[] {
  return arr
    .map((item: any, idx: number) => {
      if (typeof item === 'string') {
        const name = item.trim()
        return { position: idx + 1, name, url: '', title: name }
      }
      const name = pickName(item)
      const position = Number(item?.position ?? item?.rank ?? idx + 1) || idx + 1
      return { position, name, url: pickUrl(item), title: name }
    })
    .filter((r) => r.name && r.name.length >= 2)
    .slice(0, 10)
}

const URL_RE = /https?:\/\/[^\s)\]]+/i
const DOMAIN_RE = /\b([a-z0-9][a-z0-9-]*\.(?:co\.il|org\.il|com\.au|com|net|org|io|ai|shop|store|biz))\b/i

/** Parse a prose numbered/bulleted business list into the results[] shape. */
function parseProseList(text: string): any[] {
  const out: any[] = []
  const lines = text.split(/\r?\n/)
  let pos = 0
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    // Require a list marker: "1." "1)" "1-" "-", "*", "•", "·".
    const m = line.match(/^\s*(?:\d+[.)\-]|[-*•·])\s+(.*)$/)
    if (!m) continue
    let body = m[1].trim()
    if (!body) continue

    // Markdown link [name](url) takes priority for both name and url.
    const md = body.match(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/)
    let url = ''
    let name = ''
    if (md) {
      name = md[1]
      url = md[2]
    } else {
      const urlM = body.match(URL_RE)
      if (urlM) url = urlM[0]
      if (!url) {
        const dM = body.match(DOMAIN_RE)
        if (dM) url = `https://${dM[1]}`
      }
      name = body
    }
    // Clean the name: drop markdown emphasis, the URL, and anything after a
    // separator (dash with spaces, colon, paren, pipe, middot).
    name = name
      .replace(/\*\*|__|`/g, '')
      .replace(URL_RE, '')
      .replace(/\[|\]/g, '')
      .split(/\s[—–-]\s|[:|·(]/)[0]
      .replace(/^["'״׳]+|["'״׳]+$/g, '')
      .trim()
    if (name.length < 2) continue
    pos++
    out.push({ position: pos, name, url, title: name })
    if (out.length >= 10) break
  }
  return out
}

/**
 * Robustly parse a business list from an LLM text response.
 * Tries JSON object → JSON array → prose list. Exported so the Gemini/Grok
 * paths can share the same tolerance.
 */
export function parseBusinessList(text: string): any[] {
  if (!text) return []
  const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()

  // 1. JSON object — look for a `results` array (or a top-level array value).
  const objStart = clean.indexOf('{')
  const objEnd = clean.lastIndexOf('}')
  if (objStart !== -1 && objEnd > objStart) {
    try {
      const parsed = JSON.parse(clean.slice(objStart, objEnd + 1))
      if (Array.isArray(parsed?.results) && parsed.results.length) return normalizeResultList(parsed.results)
      if (Array.isArray(parsed?.businesses) && parsed.businesses.length) return normalizeResultList(parsed.businesses)
      if (Array.isArray(parsed)) return normalizeResultList(parsed)
    } catch { /* fall through */ }
  }

  // 2. Bare JSON array.
  const arrStart = clean.indexOf('[')
  const arrEnd = clean.lastIndexOf(']')
  if (arrStart !== -1 && arrEnd > arrStart) {
    try {
      const arr = JSON.parse(clean.slice(arrStart, arrEnd + 1))
      if (Array.isArray(arr) && arr.length) {
        const normalized = normalizeResultList(arr)
        if (normalized.length) return normalized
      }
    } catch { /* fall through */ }
  }

  // 3. Prose numbered/bulleted list fallback.
  return parseProseList(clean)
}

export interface OpenAIGeoRaw {
  ok: boolean
  text: string
  error?: string
}

/**
 * Low-level call: prompt → OpenAI Responses API with web_search.
 * Pass a ScanCostCollector to record token/web-search cost for this call.
 */
export async function callOpenAIWebSearch(prompt: string, cost?: ScanCostCollector): Promise<OpenAIGeoRaw> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return { ok: false, text: '', error: 'missing_openai_key' }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), OPENAI_GEO_TIMEOUT_MS)
  const t0 = Date.now()
  try {
    const res = await fetch(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: OPENAI_GEO_MODEL,
        input: prompt,
        tools: [{ type: OPENAI_WEB_SEARCH_TOOL }],
      }),
      signal: ctrl.signal,
    })
    const data = await res.json().catch(() => ({}))
    cost?.add({ provider: 'openai', model: OPENAI_GEO_MODEL, webSearch: true, data, ms: Date.now() - t0 })
    if (!res.ok) {
      const msg = data?.error?.message || `http_${res.status}`
      return { ok: false, text: '', error: msg }
    }
    return { ok: true, text: extractOpenAIText(data) }
  } catch (e: any) {
    cost?.add({ provider: 'openai', model: OPENAI_GEO_MODEL, webSearch: true, ms: Date.now() - t0 })
    const msg = e?.name === 'AbortError' ? `timeout_${OPENAI_GEO_TIMEOUT_MS}ms` : (e?.message ?? 'fetch_failed')
    return { ok: false, text: '', error: msg }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * GEO engine: ask ChatGPT where the business ranks for a query in Israel.
 * Returns the RAW parsed results array; the caller runs its own
 * processResults() to mark own/competitor and compute position.
 */
export async function fetchOpenAIGeoRaw(
  query: string,
  companyName: string,
  website: string,
  competitorNames: string[],
  cost?: ScanCostCollector,
): Promise<any[]> {
  const competitorLine = competitorNames.length > 0
    ? `\nמתחרים ידועים: ${competitorNames.join(', ')}`
    : ''
  const prompt = `When a user asks ChatGPT for recommendations about "${query}" in Israel, which real businesses or websites would you recommend? Use web search for current, real results.${competitorLine}

List up to 10 real businesses in order of how prominently you'd recommend them, with each business's website URL if known.
Indicate whether ${companyName} (website: ${website}) appears, and at what position.

Prefer to return ONLY a raw JSON array (no markdown), each item: {"position": 1, "name": "Business name", "url": "https://..."}.
If you cannot return JSON, return a plain numbered list (1., 2., 3. ...) of business names with their URLs — never refuse.`

  const { ok, text, error } = await callOpenAIWebSearch(prompt, cost)
  if (!ok) {
    console.warn(`[GEO openai] call failed: ${error}`)
    return []
  }
  // BLIND-SPOT FIX: always log what ChatGPT actually returned (Vercel logs).
  console.log('[GEO openai] raw response (first 800):', (text || '').slice(0, 800))
  if (!text) {
    console.warn('[GEO openai] empty text from OpenAI (no output_text)')
    return []
  }

  const results = parseBusinessList(text)
  if (results.length === 0) {
    console.warn('[GEO openai] parse produced 0 results. Raw:', text.slice(0, 800))
  } else {
    console.log(`[GEO openai] parsed ${results.length} businesses`)
  }
  return results
}
