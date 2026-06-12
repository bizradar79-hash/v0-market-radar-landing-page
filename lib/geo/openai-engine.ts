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
  const prompt = `When a user asks ChatGPT for recommendations about "${query}" in Israel, which businesses or websites would you recommend? Use web search for current, real results.${competitorLine}

List up to 10 businesses in order of how prominently you'd recommend them.
Also indicate whether ${companyName} (website: ${website}) appears, and at what position.

Return ONLY raw JSON, no markdown:
{"results": [{"position": 1, "name": "", "url": "", "isOwn": false}], "userMentioned": false, "userPosition": null}`

  const { ok, text } = await callOpenAIWebSearch(prompt, cost)
  if (!ok || !text) return []

  const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
  const s = clean.indexOf('{')
  const e = clean.lastIndexOf('}')
  if (s === -1 || e <= s) return []

  let parsed: any = {}
  try { parsed = JSON.parse(clean.slice(s, e + 1)) } catch { return [] }
  return Array.isArray(parsed.results) ? parsed.results : []
}
