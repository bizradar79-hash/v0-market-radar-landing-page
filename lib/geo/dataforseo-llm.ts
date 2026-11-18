// GEO engines via DataForSEO AI Optimization — LLM Responses (live).
//
// One schema, three providers: ChatGPT, Gemini, Claude. Each question is asked
// the way a real user would (web search on, Hebrew), and we read the model's
// FULL answer text. The client's appearance + position is detected from the
// answer's numbered recommendation list with the shared identity matcher
// (lib/geo/identity) — the same matcher the report/page use at read time.
//
// Replaces direct Grok (xAI web_search) + OpenAI (Responses web_search) calls.
// Billing = DataForSEO base fee + the provider's token cost (`money_spent`);
// with web search that's ~$0.02–0.03 per call.

import type { ScanCostCollector } from '@/lib/scan/cost-tracker'

export type GeoEngineId = 'chatgpt' | 'gemini' | 'claude'

/** DataForSEO provider path + a current, cheap model per engine (env-overridable). */
export const GEO_ENGINES: Record<GeoEngineId, { path: string; model: string; countryParam: boolean }> = {
  // Only the ChatGPT endpoint accepts web_search_country_iso_code (Gemini/Claude reject it: 40501).
  chatgpt: { path: 'chat_gpt', model: process.env.GEO_MODEL_CHATGPT || 'gpt-5.4-mini', countryParam: true },
  gemini: { path: 'gemini', model: process.env.GEO_MODEL_GEMINI || 'gemini-3.5-flash', countryParam: false },
  claude: { path: 'claude', model: process.env.GEO_MODEL_CLAUDE || 'claude-haiku-4-5', countryParam: false },
}

// Format instructions live in system_message (500-char cap, separate from the
// 500-char user_prompt) so the user prompt stays the client's real question.
export const GEO_SYSTEM_MESSAGE =
  'ענה בעברית. המלץ על עסקים, חנויות או מותגים ספציפיים ואמיתיים. הצג רשימה ממוספרת של עד 10 המלצות, מהמומלץ ביותר, ובכל שורה: שם העסק — אתר (אם ידוע) — משפט קצר למה.'

export interface LlmAnswer { ok: boolean; text: string; model: string; costUSD: number; error?: string }

function authHeader(): string | null {
  const { DATAFORSEO_LOGIN: l, DATAFORSEO_PASSWORD: p } = process.env
  return l && p ? 'Basic ' + Buffer.from(`${l}:${p}`).toString('base64') : null
}

/** Extract the answer text from an LLM Responses result. */
export function answerText(result: any): string {
  return (result?.items || [])
    .filter((i: any) => i?.type === 'message')
    .flatMap((i: any) => i.sections || [])
    .map((s: any) => (typeof s?.text === 'string' ? s.text : ''))
    .join('\n')
    .trim()
}

/** Ask one engine one question. Never throws. */
export async function askEngine(engine: GeoEngineId, question: string, opts: { timeoutMs?: number; webSearch?: boolean; systemMessage?: string; maxTokens?: number } = {}): Promise<LlmAnswer> {
  const cfg = GEO_ENGINES[engine]
  const auth = authHeader()
  if (!auth) return { ok: false, text: '', model: cfg.model, costUSD: 0, error: 'missing_credentials' }
  const webSearch = opts.webSearch ?? true
  const task: Record<string, unknown> = {
    user_prompt: question.slice(0, 500),
    model_name: cfg.model,
    system_message: (opts.systemMessage ?? GEO_SYSTEM_MESSAGE).slice(0, 500),
    web_search: webSearch,
    max_output_tokens: opts.maxTokens ?? 1500,
  }
  if (webSearch && cfg.countryParam) task.web_search_country_iso_code = 'IL'
  try {
    const res = await fetch(`https://api.dataforseo.com/v3/ai_optimization/${cfg.path}/llm_responses/live`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify([task]),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 75_000),
    })
    const data = await res.json().catch(() => ({} as any))
    const t = data?.tasks?.[0]
    const costUSD = typeof t?.cost === 'number' ? t.cost : (typeof data?.cost === 'number' ? data.cost : 0)
    if (!res.ok || data?.status_code == null) return { ok: false, text: '', model: cfg.model, costUSD, error: `http_${res.status}: ${data?.status_message ?? ''}` }
    if (t?.status_code !== 20000) return { ok: false, text: '', model: cfg.model, costUSD, error: `task_${t?.status_code}: ${t?.status_message ?? ''}` }
    const r = t?.result?.[0]
    return { ok: true, text: answerText(r), model: r?.model_name || cfg.model, costUSD }
  } catch (e: any) {
    return { ok: false, text: '', model: cfg.model, costUSD: 0, error: e?.message || 'fetch_failed' }
  }
}

const URL_RE = /https?:\/\/[^\s)\]>"'|,]+/i
const DOMAIN_RE = /\b((?:[a-z0-9-]+\.)+(?:co\.il|org\.il|com|co|il|net|org|io|shop|store)(?:\/[^\s)\]>"'|,—–-]*)?)/i

function cleanName(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // markdown links → text
    .replace(/[*_`#]+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s:.\-–—]+|[\s:.\-–—]+$/g, '')
    .trim()
}

/**
 * Parse the model's numbered recommendation list into ranked results
 * [{ name, url, description, position }]. Handles "1. **Name** — url — why",
 * "1.\n**Name** — …" (Claude puts the item on the next line), and markdown links.
 */
export function parseRankedAnswer(text: string): Array<{ name: string; url: string; description: string; position: number }> {
  if (!text) return []
  const lines = text.replace(/\r/g, '').split('\n')
  const entries: string[] = []
  let cur: string | null = null
  for (const raw of lines) {
    const line = raw.trim()
    const m = line.match(/^(\d{1,2})[.)]\s*(.*)$/)
    if (m) {
      if (cur != null) entries.push(cur)
      cur = m[2]
    } else if (cur != null) {
      if (!line) { if (cur.trim()) { entries.push(cur); cur = null } continue }
      cur += ' ' + line
    }
  }
  if (cur != null && cur.trim()) entries.push(cur)

  const out: Array<{ name: string; url: string; description: string; position: number }> = []
  for (const e of entries) {
    const body = e.trim()
    if (!body) continue
    const bold = body.match(/\*\*(.+?)\*\*/)
    const parts = body.split(/\s+[—–]\s+|\s+-\s+/)
    const name = cleanName(bold ? bold[1] : parts[0] || body).slice(0, 120)
    if (!name) continue
    const urlM = body.match(URL_RE)
    const domM = urlM ? null : body.replace(/\*\*.+?\*\*/, '').match(DOMAIN_RE)
    const url = urlM ? urlM[0].replace(/[.)]+$/, '') : domM ? `https://${domM[1].replace(/[.)]+$/, '')}` : ''
    const description = cleanName(parts.slice(1).filter(p => !URL_RE.test(p) && !DOMAIN_RE.test(p)).join(' — ')).slice(0, 300)
    out.push({ name, url, description, position: out.length + 1 })
  }
  return out.slice(0, 10)
}
