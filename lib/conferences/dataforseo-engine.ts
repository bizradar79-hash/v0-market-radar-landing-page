// Conferences via DataForSEO (Google Organic, live) + one cheap extraction call.
//
// Why not a dedicated events API: DataForSEO no longer offers Google Events, and
// the `events` block inside Google Organic carries only title/snippet/url (no
// structured date/location) and rarely appears for Hebrew queries. So:
//   1. DataForSEO Google Organic live (~$0.0035/query): 2–3 keyword-driven
//      queries ("כנס <field> 2026") → candidate pages (events blocks + organic).
//   2. ONE Gemini call, NO web search (~$0.001): classify each candidate (real
//      event vs course/article/post) and extract name/date/location from its
//      title + snippet. The model never searches — it only reads what Google
//      returned, so it can't invent events.
//   3. Code filters (kind, future date) — the caller then applies the module's
//      existing relevance scoring, and links are resolved from Google redirects.
// Replaces Grok web_search (~$0.13 per call + up to 3 paid URL lookups).

import type { ScanCostCollector } from '@/lib/scan/cost-tracker'
import { isGoogleHost, mapLimit, resolveGoogleRedirect } from '@/lib/news/dataforseo-news'

const ORGANIC = 'https://api.dataforseo.com/v3/serp/google/organic/live/advanced'
const GEMINI_MODEL = 'gemini-2.5-flash'

export interface Candidate { title: string; snippet: string; url: string }

export interface ExtractedEvent {
  name: string
  date: string        // YYYY-MM-DD | YYYY-MM | '' (unknown)
  datePrecision: 'day' | 'month' | 'unknown'
  location: string
  description: string
  category: string
  url: string
  kind: string
}

function authHeader(): string | null {
  const { DATAFORSEO_LOGIN: l, DATAFORSEO_PASSWORD: p } = process.env
  return l && p ? 'Basic ' + Buffer.from(`${l}:${p}`).toString('base64') : null
}

/** Pull candidates out of a raw Google Organic `items` array (events blocks + organic). */
export function candidatesFromItems(items: any[]): Candidate[] {
  const out: Candidate[] = []
  for (const it of items || []) {
    if (it?.type === 'events') {
      for (const e of it.items || []) {
        if (e?.title && e?.url) out.push({ title: String(e.title), snippet: String(e.snippet || ''), url: String(e.url) })
      }
    } else if (it?.type === 'organic' && it.title && it.url) {
      out.push({ title: String(it.title), snippet: String(it.description || ''), url: String(it.url) })
    }
  }
  return out
}

export async function fetchOrganic(keyword: string, depth = 20): Promise<{ ok: boolean; candidates: Candidate[]; costUSD: number; error?: string }> {
  const auth = authHeader()
  if (!auth) return { ok: false, candidates: [], costUSD: 0, error: 'missing_credentials' }
  try {
    const res = await fetch(ORGANIC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify([{ keyword, location_name: 'Israel', language_code: 'he', depth }]),
      signal: AbortSignal.timeout(30_000),
    })
    const data = await res.json().catch(() => ({} as any))
    const costUSD = typeof data?.cost === 'number' ? data.cost : 0
    const t = data?.tasks?.[0]
    if (!res.ok || data?.status_code == null) return { ok: false, candidates: [], costUSD, error: `http_${res.status}` }
    if (t?.status_code && t.status_code !== 20000) return { ok: false, candidates: [], costUSD, error: `task_${t.status_code}: ${t.status_message ?? ''}` }
    return { ok: true, candidates: candidatesFromItems(t?.result?.[0]?.items ?? []), costUSD }
  } catch (e: any) {
    return { ok: false, candidates: [], costUSD: 0, error: e?.message || 'fetch_failed' }
  }
}

/** Keyword-driven queries: the client's top field phrase + the industry anchor, this year (+ next from Sept). */
export function buildConferenceQueries(keywords: string[], anchor: string, now = new Date()): string[] {
  const y = now.getUTCFullYear()
  const years = now.getUTCMonth() >= 8 ? `${y} OR ${y + 1}` : String(y)
  const q = (kw: string) => (/\s/.test(kw) ? `"${kw}"` : kw)
  const out: string[] = []
  const kw0 = keywords.find(Boolean)
  if (kw0) out.push(`כנס ${q(kw0)} ${years}`)
  if (anchor) out.push(`כנס ${anchor} ${years}`, `תערוכה ${anchor} ${years}`)
  else if (keywords[1]) out.push(`כנס ${q(keywords[1])} ${years}`)
  return [...new Set(out)].slice(0, 3)
}

/** Events the extractor may return; anything else (course/article/post/other) is dropped in code. */
export const EVENT_KINDS = new Set(['conference', 'expo', 'festival', 'summit', 'professional_day', 'meetup'])

function extractionPrompt(cands: Candidate[], todayISO: string, subject: string): string {
  const lines = cands.map((c, i) => `[${i}] ${c.title}\n    ${c.snippet.replace(/\s+/g, ' ').slice(0, 300)}`).join('\n')
  return `היום: ${todayISO}. תחום העסק: ${subject}.
להלן תוצאות חיפוש גוגל. לכל תוצאה קבע מה היא, וחלץ פרטים רק ממה שכתוב בה בפועל — אל תמציא תאריך או מקום שלא מופיעים בטקסט.

${lines}

החזר JSON בלבד: מערך עם אובייקט לכל תוצאה:
{"i": <מספר>, "kind": "conference|expo|festival|summit|professional_day|meetup|course|article|social_post|other", "name": "שם האירוע בעברית", "date": "YYYY-MM-DD או YYYY-MM או ריק אם לא כתוב", "location": "עיר/מקום או ריק", "description": "משפט אחד בעברית על האירוע", "category": "קטגוריה קצרה"}
- kind=course לקורס/השתלמות מתמשכת, article לכתבה/מאמר, social_post לפוסט ברשת חברתית שאינו מודעה על אירוע מסוים.
- date: תאריך האירוע עצמו (לא תאריך הפרסום). אם מופיע טווח — תאריך ההתחלה.`
}

/** One Gemini call, no tools (no web search). Returns parsed rows or []. */
export async function extractEvents(cands: Candidate[], todayISO: string, subject: string, cost?: ScanCostCollector): Promise<ExtractedEvent[]> {
  if (!cands.length || !process.env.GEMINI_API_KEY) return []
  const t0 = Date.now()
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: extractionPrompt(cands, todayISO, subject) }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
    }),
    signal: AbortSignal.timeout(45_000),
  })
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  cost?.add({ provider: 'gemini', model: GEMINI_MODEL, data, ms: Date.now() - t0 })
  const text = (data?.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join('')
  let rows: any[] = []
  try { const j = JSON.parse(text); rows = Array.isArray(j) ? j : (j.items || j.results || []) } catch { return [] }
  return mapExtracted(rows, cands)
}

/** Join model rows back to their candidate (the URL always comes from Google, never the model). */
export function mapExtracted(rows: any[], cands: Candidate[]): ExtractedEvent[] {
  const out: ExtractedEvent[] = []
  for (const r of rows || []) {
    const c = cands[Number(r?.i)]
    if (!c) continue
    const kind = String(r.kind || '').toLowerCase()
    if (!EVENT_KINDS.has(kind)) continue
    const date = typeof r.date === 'string' && /^\d{4}-\d{2}(-\d{2})?$/.test(r.date.trim()) ? r.date.trim() : ''
    out.push({
      name: String(r.name || c.title).trim(),
      date,
      datePrecision: date.length === 10 ? 'day' : date.length === 7 ? 'month' : 'unknown',
      location: String(r.location || '').trim(),
      description: String(r.description || c.snippet).trim(),
      category: String(r.category || '').trim(),
      url: c.url,
      kind,
    })
  }
  return out
}

/** Google redirect links → the real event page (3 at a time, one retry). */
export async function resolveEventLinks<T extends { url: string }>(items: T[]): Promise<T[]> {
  return mapLimit(items, 3, async (it) => {
    if (!isGoogleHost(it.url)) return it
    for (let attempt = 0; attempt < 2; attempt++) {
      try { const real = await resolveGoogleRedirect(it.url); if (real) return { ...it, url: real } } catch {}
    }
    return it
  })
}
