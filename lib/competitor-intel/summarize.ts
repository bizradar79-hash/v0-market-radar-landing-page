// Turns a competitor's RAW multi-source scrapes into a polished Hebrew weekly
// briefing. The scrapes are noisy markdown (nav, catalogs, post feeds with
// relative "3w" or absolute "August 16, 2026" dates) — the model's job is to
// extract only what the competitor actually DID, and what it means for the client.
//
// HARD RULE baked into the prompt: never invent activity. An empty/failed source
// is reported as such, never filled in.

import { callModel } from '@/lib/call-model'
import type { SourceStatus } from '@/lib/brightdata/client'

export const INTEL_SOURCES = ['website', 'instagram', 'facebook', 'linkedin', 'tiktok'] as const
export type IntelSource = typeof INTEL_SOURCES[number]

export const SOURCE_LABELS: Record<IntelSource, string> = {
  website: 'אתר', instagram: 'אינסטגרם', facebook: 'פייסבוק', linkedin: 'לינקדאין', tiktok: 'טיקטוק',
}

export interface SourceResult {
  source: IntelSource
  status: SourceStatus
  url?: string
  text?: string
  error?: string
}

export interface BriefingItem {
  /** What the competitor did — one concrete, sourced fact. */
  what: string
  /** Which source it came from. */
  source: IntelSource
  /** Date as given by the source ("3w", "16 באוגוסט 2026"), or '' if undated. */
  date?: string
  /** Category: launch / price / campaign / content / hiring / event / other. */
  kind?: string
  /** Amber, non-alarmist implication for the client. */
  implication?: string
}

export interface CompetitorBriefing {
  summary: string                 // one-line overall summary
  items: BriefingItem[]           // what's new/notable this period
  sourcesUsed: IntelSource[]      // sources that actually contributed
  sourcesEmpty: IntelSource[]     // scraped but nothing usable / failed
  generatedAt: string
}

const MAX_CHARS_PER_SOURCE = Number(process.env.INTEL_MAX_CHARS_PER_SOURCE) || 12000

// Weekly tracking = RECENT activity only. Items older than this window are
// dropped from the briefing (env-tunable). Belt-and-suspenders: the prompt also
// asks the model to pre-filter, and this code enforces it hard.
export const RECENCY_DAYS = Number(process.env.COMPETITOR_INTEL_RECENCY_DAYS) || 30

const HE_MONTHS: Array<[RegExp, number]> = [
  [/ינואר|january|jan\b/i, 1], [/פברואר|february|feb\b/i, 2], [/מרץ|מרס|march|mar\b/i, 3],
  [/אפריל|april|apr\b/i, 4], [/מאי|may\b/i, 5], [/יוני|june|jun\b/i, 6],
  [/יולי|july|jul\b/i, 7], [/אוגוסט|august|aug\b/i, 8], [/ספטמבר|september|sep\b/i, 9],
  [/אוקטובר|october|oct\b/i, 10], [/נובמבר|november|nov\b/i, 11], [/דצמבר|december|dec\b/i, 12],
]

/**
 * Parse an item's date text into a real Date. Handles the three shapes our
 * sources produce:
 *   • ISO            "2026-07-13"
 *   • absolute text  "13 ביולי 2026" / "August 16, 2026" / "1 בספטמבר 2025"
 *   • relative       "3w" / "2mo" / "5d" / "לפני שבועיים"  (relative to `now`)
 * Returns null when nothing parseable is found.
 */
export function parseItemDate(raw: string | null | undefined, now = new Date()): Date | null {
  const s = String(raw ?? '').trim()
  if (!s) return null

  // ISO first.
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`)

  // Relative: "3w", "2mo", "5d", "10h", "2y" (LinkedIn/social style).
  const rel = s.match(/(\d+)\s*(y|yr|years?|שנ|mo|months?|חודש|w|weeks?|שבוע|d|days?|יום|ימים|h|hours?|שע)/i)
  if (rel) {
    const n = parseInt(rel[1], 10)
    const unit = rel[2].toLowerCase()
    const days = /^(y|yr|year|שנ)/.test(unit) ? n * 365
      : /^(mo|month|חודש)/.test(unit) ? n * 30
      : /^(w|week|שבוע)/.test(unit) ? n * 7
      : /^(h|hour|שע)/.test(unit) ? 0
      : n // d / day / יום
    return new Date(now.getTime() - days * 86400000)
  }
  // Hebrew relative words without a number.
  if (/אתמול|yesterday/i.test(s)) return new Date(now.getTime() - 86400000)
  if (/היום|today/i.test(s)) return new Date(now.getTime())
  if (/שבועיים/.test(s)) return new Date(now.getTime() - 14 * 86400000)
  if (/חודשיים/.test(s)) return new Date(now.getTime() - 60 * 86400000)

  // Absolute text: month name + optional day + optional year.
  const year = s.match(/\b(20\d{2})\b/)
  for (const [re, m] of HE_MONTHS) {
    if (re.test(s)) {
      const d = s.match(/\b(\d{1,2})\b(?!\d)/)
      const day = d ? Math.min(28, parseInt(d[1], 10)) : 15
      const y = year ? parseInt(year[1], 10) : now.getFullYear()
      return new Date(Date.UTC(y, m - 1, day))
    }
  }

  // D/M/YYYY or D.M.YYYY.
  const dmy = s.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/)
  if (dmy) return new Date(Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1]))

  // A bare year that isn't the current one → clearly old.
  if (year && parseInt(year[1], 10) < now.getFullYear()) {
    return new Date(Date.UTC(parseInt(year[1], 10), 11, 31))
  }
  return null
}

/** Text that clearly marks an item as old even without a parseable date. */
function looksOld(item: { what?: string; date?: string }, now = new Date()): boolean {
  const text = `${item.what || ''} ${item.date || ''}`
  const years = text.match(/\b(20\d{2})\b/g)
  if (!years) return false
  // Any explicit year older than the current one → treat as old.
  return years.some((y) => parseInt(y, 10) < now.getFullYear())
}

export const UNCERTAIN_DATE_LABEL = 'תאריך לא ודאי'

/**
 * Keep only items from the last `days`. Undated items are KEPT (real activity
 * shouldn't vanish just because a source omitted a date) and flagged — unless
 * their text clearly indicates an older year.
 */
export function filterRecentItems<T extends { what?: string; date?: string }>(
  items: T[], days = RECENCY_DAYS, now = new Date(),
): T[] {
  const cutoff = now.getTime() - days * 86400000
  return items.filter((it) => {
    const d = parseItemDate(it.date, now)
    if (d) return d.getTime() >= cutoff
    return !looksOld(it, now) // undated → keep unless it reads as old
  }).map((it) => {
    const d = parseItemDate(it.date, now)
    return d ? it : { ...it, date: (it.date || '').trim() || UNCERTAIN_DATE_LABEL }
  })
}

function extractJson(text: string): any | null {
  const clean = (text || '').replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
  try { return JSON.parse(clean) } catch {}
  const s = clean.indexOf('{'); const e = clean.lastIndexOf('}')
  if (s === -1 || e <= s) return null
  try { return JSON.parse(clean.slice(s, e + 1)) } catch { return null }
}

/**
 * Summarize one competitor's scrapes into a structured briefing.
 * Deterministic JSON out; degrades to an honest empty briefing on any failure.
 */
export async function summarizeCompetitor(opts: {
  competitorName: string
  clientContext: string          // what the CLIENT does (for relevance)
  sources: SourceResult[]
  provider?: string
  model?: string
}): Promise<CompetitorBriefing> {
  const { competitorName, clientContext, sources } = opts
  const provider = opts.provider || 'gemini'
  const model = opts.model || 'gemini-2.5-flash'

  const used = sources.filter((s) => s.status === 'ok' && (s.text || '').trim().length > 0)
  const empty = sources.filter((s) => s.status !== 'ok' || !(s.text || '').trim())

  const base: CompetitorBriefing = {
    summary: '',
    items: [],
    sourcesUsed: used.map((s) => s.source),
    sourcesEmpty: empty.map((s) => s.source),
    generatedAt: new Date().toISOString(),
  }

  if (used.length === 0) {
    return { ...base, summary: `לא נאספו נתונים זמינים עבור ${competitorName} במקורות שנבדקו.` }
  }

  const blocks = used
    .map((s) => `### מקור: ${SOURCE_LABELS[s.source]} (${s.source})\nURL: ${s.url || ''}\n---\n${(s.text || '').slice(0, MAX_CHARS_PER_SOURCE)}`)
    .join('\n\n')

  const todayHe = new Date().toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })

  const emptyNote = empty.length
    ? `\nמקורות שלא הניבו נתונים (אל תמציא עבורם תוכן): ${empty.map((s) => SOURCE_LABELS[s.source]).join(', ')}.`
    : ''

  const prompt = `אתה אנליסט מודיעין תחרותי. לפניך גרידה גולמית (markdown רועש — תפריטים, ניווט, קטלוג) של הנוכחות הדיגיטלית של המתחרה "${competitorName}".

הלקוח שלנו: ${clientContext || 'לא צוין'}

המשימה: לחלץ אך ורק מה שהמתחרה **עשה בפועל לאחרונה** — השקות מוצר, שינויי מחיר, קמפיינים, תוכן בולט, גיוס עובדים, אירועים/כנסים, שיתופי פעולה. התעלם מרעש ניווט, תפריטים וטקסט שיווקי גנרי.

חלון זמן: כלול אך ורק פריטים מ-${RECENCY_DAYS} הימים האחרונים (התאריך היום: ${todayHe}). התעלם לחלוטין מתוכן ארכיוני ישן — פוסטים ומאמרים משנים קודמות אינם רלוונטיים לדוח שבועי. אם אין פעילות מהתקופה הזו, החזר items ריק.

חוקים קשיחים:
- אסור להמציא. כל פריט חייב להתבסס על טקסט שמופיע בגרידה. אם אין ממצאים — החזר items ריק.
- ציין תאריך רק אם הוא מופיע במקור (יחסי כמו "3w" או מוחלט כמו "August 16, 2026") — תרגם לעברית קריאה. אם אין תאריך, השאר ריק.
- לכל פריט הוסף "implication": מה זה אומר ללקוח שלנו — הזדמנות או נקודה למחשבה. ענייני ולא מבהיל.
- "summary": משפט אחד שמסכם מה המתחרה עשה בתקופה.
${emptyNote}

הגרידה:
${blocks}

החזר JSON בלבד:
{"summary":"","items":[{"what":"","source":"website|instagram|facebook|linkedin|tiktok","date":"","kind":"launch|price|campaign|content|hiring|event|other","implication":""}]}`

  try {
    const raw = await callModel(provider, model, prompt)
    const parsed = extractJson(raw)
    if (!parsed) return { ...base, summary: 'לא ניתן היה לנתח את הנתונים שנאספו.' }
    const items: BriefingItem[] = Array.isArray(parsed.items)
      ? parsed.items
          .filter((i: any) => i && typeof i.what === 'string' && i.what.trim())
          .slice(0, 12)
          .map((i: any) => ({
            what: String(i.what).trim(),
            source: (INTEL_SOURCES as readonly string[]).includes(i.source) ? i.source : used[0].source,
            date: i.date ? String(i.date).trim() : '',
            kind: i.kind ? String(i.kind).trim() : 'other',
            implication: i.implication ? String(i.implication).trim() : '',
          }))
      : []

    // HARD recency filter (the prompt asks too, but never trust it alone):
    // drop anything outside the window; undated items survive unless they read old.
    const recent = filterRecentItems(items)
    const summary = recent.length === 0
      ? `לא זוהתה פעילות חדשה ב-${RECENCY_DAYS} הימים האחרונים.`
      : String(parsed.summary || '').trim()
    return { ...base, summary, items: recent }
  } catch (e: any) {
    return { ...base, summary: `שגיאה בניתוח: ${e?.message || 'unknown'}` }
  }
}
