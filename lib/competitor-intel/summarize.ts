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

  const emptyNote = empty.length
    ? `\nמקורות שלא הניבו נתונים (אל תמציא עבורם תוכן): ${empty.map((s) => SOURCE_LABELS[s.source]).join(', ')}.`
    : ''

  const prompt = `אתה אנליסט מודיעין תחרותי. לפניך גרידה גולמית (markdown רועש — תפריטים, ניווט, קטלוג) של הנוכחות הדיגיטלית של המתחרה "${competitorName}".

הלקוח שלנו: ${clientContext || 'לא צוין'}

המשימה: לחלץ אך ורק מה שהמתחרה **עשה בפועל** — השקות מוצר, שינויי מחיר, קמפיינים, תוכן בולט, גיוס עובדים, אירועים/כנסים, שיתופי פעולה. התעלם מרעש ניווט, תפריטים וטקסט שיווקי גנרי.

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
    return { ...base, summary: String(parsed.summary || '').trim(), items }
  } catch (e: any) {
    return { ...base, summary: `שגיאה בניתוח: ${e?.message || 'unknown'}` }
  }
}
