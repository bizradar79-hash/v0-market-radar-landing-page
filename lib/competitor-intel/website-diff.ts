/**
 * MEANINGFUL website change detection for a tracked competitor.
 *
 * Their site is already scraped every run; here we keep the cleaned text so the
 * next run can compare against it. A model is used ONLY for the comparison —
 * "did this business change what it sells / charges / promises?" is exactly the
 * judgement deterministic code cannot make, while "did the text change at all?"
 * is exactly what it can.
 *
 * COST DISCIPLINE — the model is unreachable unless the text really moved:
 *   1. no previous snapshot  → store the baseline, no call
 *   2. text effectively unchanged (normalized hash / similarity) → no call
 *   3. only a MATERIAL change reaches the model, and then exactly once
 * So a competitor with a static site costs nothing, forever.
 */
import { createHash } from 'crypto'
import { callWithUsage } from './summarize'
import type { LlmUsage } from './summarize'

export const WEBSITE_DIFF_ENABLED = process.env.COMPETITOR_WEBSITE_DIFF_ENABLED !== 'false'

/** Below this Jaccard similarity the page is treated as materially changed. */
const SIMILARITY_THRESHOLD = Number(process.env.COMPETITOR_WEBSITE_SIMILARITY) || 0.97
/** Too little text to reason about — treat as no signal rather than a change. */
const MIN_TEXT_CHARS = 400
/** Cap what we send: the model only needs the substance, not the whole site. */
const MAX_SNAPSHOT_CHARS = Number(process.env.COMPETITOR_WEBSITE_SNAPSHOT_CHARS) || 6000

const DIFF_PROVIDER = process.env.COMPETITOR_WEBSITE_DIFF_PROVIDER || 'gemini'
const DIFF_MODEL = process.env.COMPETITOR_WEBSITE_DIFF_MODEL || 'gemini-2.0-flash'

export interface WebsiteChange {
  kind: 'product' | 'price' | 'promotion' | 'positioning' | 'location' | 'other'
  text: string
  /** Why the client should care — omitted when there's nothing honest to say. */
  soWhat?: string
}
export interface WebsiteDiffResult {
  status: 'baseline' | 'unchanged' | 'changed' | 'skipped' | 'failed'
  changes: WebsiteChange[]
  /** The cleaned text to persist as the new snapshot (empty → keep the old). */
  snapshot: string
  hash: string
  similarity?: number
  llm?: LlmUsage
  note?: string
  error?: string
}

// ── Cleaning ───────────────────────────────────────────────────────────────
// Scraped markdown carries chrome that changes on every fetch (cookie bars,
// nav, timestamps, share widgets). Left in, it would trip the change-gate on
// every run and pay for a model call to discover nothing.
const NOISE_LINE = new RegExp([
  'cookie', 'עוגיות', 'נגישות', 'accessibility', 'תפריט', 'menu', 'ניווט', 'navigation',
  'כל הזכויות שמורות', 'all rights reserved', 'privacy', 'מדיניות פרטיות',
  'תנאי שימוש', 'terms of', 'שתף', 'share', 'follow us', 'עקבו אחרינו',
  'skip to content', 'דילוג לתוכן', 'newsletter', 'הרשמה לניוזלטר',
].join('|'), 'i')

/** Dates/times/counters drift constantly and mean nothing on their own. */
const VOLATILE = [
  /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g,          // dates
  /\b\d{1,2}:\d{2}(:\d{2})?\b/g,                    // times
  /\b(20\d{2})\b/g,                                 // years
  /\?[a-z0-9_=&%-]{8,}/gi,                          // cache-busting query strings
]

export function cleanWebsiteText(raw: string | null | undefined): string {
  const lines = String(raw || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')           // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')         // links → their text
    .replace(/<[^>]+>/g, ' ')                        // stray html
    .split(/\r?\n/)
    .map((l) => l.replace(/[#*_>`|]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((l) => l.length >= 3 && !NOISE_LINE.test(l))
  // Collapse repeated lines (nav repeated per section, footers).
  const seen = new Set<string>()
  const out: string[] = []
  for (const l of lines) {
    const key = l.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(l)
  }
  return out.join('\n').trim()
}

/** Normalized form used for the change-gate only (never shown, never stored). */
function normalizeForCompare(text: string): string {
  let t = text.toLowerCase()
  for (const re of VOLATILE) t = t.replace(re, ' ')
  return t.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
}

export function contentHash(text: string): string {
  return createHash('sha1').update(normalizeForCompare(text)).digest('hex')
}

/** Jaccard over word shingles — cheap, and immune to reordering noise. */
/**
 * THE COST GATE. One place decides whether a model call is justified, so the
 * rule can't drift between the engine and its tests.
 */
export function isMateriallyChanged(prev: string, curr: string): { changed: boolean; similarity: number } {
  const sim = similarity(prev, curr)
  const changed = contentHash(prev) !== contentHash(curr) && sim < SIMILARITY_THRESHOLD
  return { changed, similarity: sim }
}

export function similarity(a: string, b: string): number {
  const toks = (t: string) => new Set(normalizeForCompare(t).split(' ').filter((w) => w.length > 2))
  const A = toks(a), B = toks(b)
  if (!A.size && !B.size) return 1
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const w of A) if (B.has(w)) inter++
  return inter / (A.size + B.size - inter)
}

// ── The prompt ─────────────────────────────────────────────────────────────
function buildDiffPrompt(name: string, prev: string, curr: string): string {
  return `אתה מנתח שינויים באתר של עסק מתחרה. לפניך שתי גרסאות של תוכן האתר של "${name}" — קודמת ונוכחית.

המשימה: לזהות אך ורק שינויים **מהותיים לעסק**. אלה השינויים שמעניינים:
- מוצר או שירות חדש שנוסף
- מוצר או שירות שהוסר
- שינוי מחיר (ציין מחיר קודם ← מחיר חדש אם שניהם מופיעים)
- מבצע / הטבה / קמפיין חדש
- שינוי במסר השיווקי או בפוזיציונינג (מה הם מבטיחים ללקוח)
- סניף חדש, כתובת חדשה או שינוי שעות פעילות

התעלם לחלוטין מ (אלה אינם שינויים):
- שינויי תאריכים, שנים, שעות עדכון
- פוסטים/כתבות חדשות בבלוג — אלא אם הם מכריזים על מהלך עסקי ממשי
- ניסוח מחדש, שינויי מילים קוסמטיים, תיקוני כתיב
- שינוי סדר של אזורים בעמוד, באנרים מתחלפים, תמונות
- שינויים טכניים באתר

כללים:
- אל תמציא. אם משהו לא מופיע בבירור באחת הגרסאות — אל תדווח עליו.
- אם אין שינוי מהותי — החזר מערך ריק. זו תשובה לגיטימית ומצופה.
- כל שינוי: משפט אחד קצר בעברית.
- "soWhat": למה זה משנה ללקוח שלנו — רק אם יש משהו אמיתי לומר, אחרת השמט.

החזר JSON בלבד בפורמט:
{"changes":[{"kind":"product|price|promotion|positioning|location|other","text":"...","soWhat":"..."}]}

=== גרסה קודמת ===
${prev.slice(0, MAX_SNAPSHOT_CHARS)}

=== גרסה נוכחית ===
${curr.slice(0, MAX_SNAPSHOT_CHARS)}`
}

const VALID_KINDS = new Set(['product', 'price', 'promotion', 'positioning', 'location', 'other'])

function parseChanges(raw: string): WebsiteChange[] {
  const clean = raw.replace(/```json/gi, '').replace(/```/g, '').trim()
  const start = clean.indexOf('{')
  const end = clean.lastIndexOf('}')
  if (start === -1 || end <= start) return []
  try {
    const parsed = JSON.parse(clean.slice(start, end + 1))
    const arr = Array.isArray(parsed?.changes) ? parsed.changes : []
    return arr
      .map((c: any) => ({
        kind: VALID_KINDS.has(String(c?.kind)) ? c.kind : 'other',
        text: String(c?.text || '').trim().slice(0, 220),
        soWhat: String(c?.soWhat || '').trim().slice(0, 220) || undefined,
      }))
      .filter((c: WebsiteChange) => c.text.length > 3)
      .slice(0, 5)
  } catch { return [] }
}

/**
 * Compare a competitor's freshly scraped site against the stored snapshot.
 * Never throws — a failure degrades to status 'failed' with the baseline kept.
 */
export async function detectWebsiteChanges(opts: {
  competitorName: string
  rawText: string | null | undefined
  prevSnapshot?: string | null
  log?: (msg: string) => void
}): Promise<WebsiteDiffResult> {
  const L = opts.log || (() => {})
  const curr = cleanWebsiteText(opts.rawText)
  const hash = contentHash(curr)

  if (!WEBSITE_DIFF_ENABLED) {
    return { status: 'skipped', changes: [], snapshot: curr, hash, note: 'website diff disabled' }
  }
  if (curr.length < MIN_TEXT_CHARS) {
    L(`WEBSITE too little text (${curr.length} chars) — no baseline, no diff`)
    return { status: 'skipped', changes: [], snapshot: curr, hash, note: 'too_little_text' }
  }

  const prev = String(opts.prevSnapshot || '').trim()
  // GATE 1 — first scan: store the baseline, spend nothing.
  if (!prev) {
    L('WEBSITE baseline stored (first scan) — no diff, no LLM')
    return { status: 'baseline', changes: [], snapshot: curr, hash }
  }

  // GATE 2 — did anything actually move? Deterministic, free.
  const { changed, similarity: sim } = isMateriallyChanged(prev, curr)
  if (!changed) {
    L(`WEBSITE unchanged (similarity ${sim.toFixed(3)}) — NO LLM call, zero cost`)
    return { status: 'unchanged', changes: [], snapshot: curr, hash, similarity: sim }
  }

  // Only now is a model call justified — exactly one.
  L(`WEBSITE changed (similarity ${sim.toFixed(3)}) → diffing with ${DIFF_MODEL}`)
  try {
    const { text, usage } = await callWithUsage(
      DIFF_PROVIDER, DIFF_MODEL, buildDiffPrompt(opts.competitorName, prev, curr),
    )
    const changes = parseChanges(text)
    L(`WEBSITE diff → ${changes.length} meaningful change(s), $${usage.costUSD.toFixed(5)}`)
    return { status: 'changed', changes, snapshot: curr, hash, similarity: sim, llm: usage }
  } catch (e: any) {
    L(`WEBSITE diff FAILED: ${e?.message}`)
    // Snapshot still advances — otherwise every later run re-diffs the same gap.
    return { status: 'failed', changes: [], snapshot: curr, hash, similarity: sim, error: (e?.message || 'diff_failed').slice(0, 120) }
  }
}
