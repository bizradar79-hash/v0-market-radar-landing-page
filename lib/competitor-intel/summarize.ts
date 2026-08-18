// Turns a competitor's RAW multi-source scrapes into a polished Hebrew weekly
// briefing. The scrapes are noisy markdown (nav, catalogs, post feeds with
// relative "3w" or absolute "August 16, 2026" dates) — the model's job is to
// extract only what the competitor actually DID, and what it means for the client.
//
// HARD RULE baked into the prompt: never invent activity. An empty/failed source
// is reported as such, never filled in.

import { callModel } from '@/lib/call-model'
import { norm } from '@/lib/match/hebrew-core'
import type { SourceStatus, SocialPost, ProfileMeta } from '@/lib/brightdata/client'

// ACTIVE sources scraped per competitor. TikTok was removed (unreliable for now)
// — scrapeTikTokProfile() is retained in the BrightData client, just unused, and
// 'tiktok' stays in IntelSource so previously-stored runs still render.
export const INTEL_SOURCES = ['website', 'instagram', 'facebook', 'linkedin'] as const
export type IntelSource = 'website' | 'instagram' | 'facebook' | 'linkedin' | 'tiktok'

export const SOURCE_LABELS: Record<IntelSource, string> = {
  website: 'אתר', instagram: 'אינסטגרם', facebook: 'פייסבוק', linkedin: 'לינקדאין', tiktok: 'טיקטוק',
}

export interface SourceResult {
  source: IntelSource
  status: SourceStatus
  url?: string
  /** Raw markdown (generic path) OR a readable rendering of `posts` (dedicated path). */
  text?: string
  /** Structured posts from a DEDICATED scraper (TikTok today; template for the rest). */
  posts?: SocialPost[]
  profile?: ProfileMeta
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

/** Zero-extra-cost insights computed IN CODE from data we already scraped.
 *  No additional BrightData calls — pure computation, so the numbers are exact. */
export interface DerivedInsights {
  /** a. Posting cadence over the window. */
  cadence?: { total: number; perSource: Array<{ source: IntelSource; count: number }>; level: 'פעיל מאוד' | 'פעיל' | 'שקט'; text: string }
  /** b. Recurring themes across recent posts. */
  themes?: { terms: Array<{ term: string; count: number }>; text: string }
  /** c. Top-engagement recent posts (only when engagement numbers exist). */
  topPosts?: Array<{ caption: string; source: IntelSource; date: string; engagement: number; text: string }>
  /** d. Where they're most active. */
  presence?: { source: IntelSource; count: number; text: string }
  /** e. Follower counts per source — STORED NOW so future runs can show growth.
   *  Growth tracking activates once we have 2+ snapshots for the same competitor. */
  followers?: Array<{ source: IntelSource; followers: number }>
}

export interface CompetitorBriefing {
  summary: string                 // one-line overall summary
  items: BriefingItem[]           // what's new/notable this period
  sourcesUsed: IntelSource[]      // sources that actually contributed
  sourcesEmpty: IntelSource[]     // scraped but nothing usable / failed
  insights?: DerivedInsights      // computed in code (zero extra scrape cost)
  generatedAt: string
}

const MAX_CHARS_PER_SOURCE = Number(process.env.INTEL_MAX_CHARS_PER_SOURCE) || 12000

// Weekly tracking = RECENT activity only. Items older than this window are
// dropped from the briefing (env-tunable). Belt-and-suspenders: the prompt also
// asks the model to pre-filter, and this code enforces it hard.
export const RECENCY_DAYS = Number(process.env.COMPETITOR_INTEL_RECENCY_DAYS) || 45

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

// ── Derived insights (ZERO extra BrightData cost) ──────────────────────────
// Everything below is computed from posts we ALREADY scraped. Each insight
// degrades gracefully: when the data can't support it, it's omitted rather
// than guessed.

// Cadence thresholds over the recency window (posts across all sources).
const CADENCE_VERY_ACTIVE = Number(process.env.INTEL_CADENCE_VERY_ACTIVE) || 8
const CADENCE_ACTIVE = Number(process.env.INTEL_CADENCE_ACTIVE) || 3

// Hebrew/English stop-words for theme extraction (too generic to be a "theme").
const THEME_STOP = new Set([
  'את','של','עם','על','לא','כל','גם','זה','אני','אנחנו','הוא','היא','יש','אין','מה','כי','אבל','או','אם','רק','עוד','כמו','כדי','אחרי','לפני','בין','הכי','יותר','מאוד','שלנו','שלכם','שלך','היום','חדש','חדשה',
  'the','and','for','with','you','your','our','this','that','from','are','was','have','has','all','new','out','get','can','will','more','about','how','why','what',
])

function themeTokens(text: string): string[] {
  return norm(text)
    .split(/\s+/)
    .map((w) => w.replace(/^#/, ''))
    .filter((w) => w.length >= 3 && !THEME_STOP.has(w) && !/^\d+$/.test(w))
}

/**
 * Compute all derived insights for one competitor from the scraped sources.
 * Uses structured `posts` where a dedicated scraper provided them; falls back to
 * the LLM's dated briefing items for sources that only yield markdown.
 */
export function computeInsights(
  sources: SourceResult[], items: BriefingItem[], now = new Date(), days = RECENCY_DAYS,
): DerivedInsights {
  const out: DerivedInsights = {}
  const cutoff = now.getTime() - days * 86400000

  // Recent structured posts per source (dedicated scrapers).
  const recentBySource = new Map<IntelSource, Array<SocialPost>>()
  for (const s of sources) {
    const recent = (s.posts || []).filter((p) => {
      const d = parseItemDate(p.date, now)
      return d ? d.getTime() >= cutoff : false
    })
    if (recent.length) recentBySource.set(s.source, recent)
  }

  // Fall back to briefing items (already recency-filtered) for markdown sources.
  const itemCountBySource = new Map<IntelSource, number>()
  for (const it of items) {
    if (recentBySource.has(it.source)) continue // structured data wins
    itemCountBySource.set(it.source, (itemCountBySource.get(it.source) || 0) + 1)
  }

  const perSource: Array<{ source: IntelSource; count: number }> = []
  for (const [source, posts] of recentBySource) perSource.push({ source, count: posts.length })
  for (const [source, count] of itemCountBySource) perSource.push({ source, count })
  perSource.sort((a, b) => b.count - a.count)

  // (a) CADENCE
  const total = perSource.reduce((n, p) => n + p.count, 0)
  if (total > 0) {
    const level = total >= CADENCE_VERY_ACTIVE ? 'פעיל מאוד' : total >= CADENCE_ACTIVE ? 'פעיל' : 'שקט'
    out.cadence = {
      total, perSource, level,
      text: `${total} פרסומים ב-${days} הימים האחרונים (${level}) — ${perSource.map((p) => `${SOURCE_LABELS[p.source]}: ${p.count}`).join(' · ')}`,
    }
  }

  // (b) RECURRING THEMES — needs enough text to be meaningful.
  const texts: string[] = []
  for (const posts of recentBySource.values()) {
    for (const p of posts) texts.push(`${p.caption || ''} ${(p.hashtags || []).join(' ')}`)
  }
  for (const it of items) texts.push(it.what || '')
  const freq = new Map<string, number>()
  for (const t of texts) {
    for (const tok of new Set(themeTokens(t))) freq.set(tok, (freq.get(tok) || 0) + 1)
  }
  const terms = [...freq.entries()]
    .filter(([, c]) => c >= 2) // must recur
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([term, count]) => ({ term, count }))
  if (terms.length > 0 && texts.length >= 3) {
    out.themes = { terms, text: `הכי מדברים על: ${terms.map((t) => `"${t.term}" (${t.count})`).join(' · ')}` }
  }

  // (c) TOP-ENGAGEMENT POSTS — only where real numbers exist.
  const engaged: Array<{ caption: string; source: IntelSource; date: string; engagement: number; text: string }> = []
  for (const [source, posts] of recentBySource) {
    for (const p of posts) {
      const eng = (p.likes ?? 0) + (p.comments ?? 0)
      if (p.likes == null && p.comments == null) continue // no numbers → skip
      if (eng <= 0) continue
      const when = p.date ? new Date(p.date).toLocaleDateString('he-IL') : ''
      engaged.push({
        caption: (p.caption || '').slice(0, 140), source, date: when, engagement: eng,
        text: `${when ? when + ' · ' : ''}${eng.toLocaleString()} תגובות+לייקים${p.views != null ? ` · ${p.views.toLocaleString()} צפיות` : ''}`,
      })
    }
  }
  if (engaged.length > 0) {
    out.topPosts = engaged.sort((a, b) => b.engagement - a.engagement).slice(0, 2)
  }

  // (d) PLATFORM PRESENCE
  if (perSource.length > 0 && perSource[0].count > 0) {
    const top = perSource[0]
    out.presence = { source: top.source, count: top.count, text: `הכי פעילים ב${SOURCE_LABELS[top.source]} (${top.count} פרסומים)` }
  }

  // (e) FOLLOWER COUNTS — captured now; GROWTH tracking activates once we have
  // 2+ stored snapshots for the same competitor (compare across created_at).
  const followers = sources
    .filter((s) => typeof s.profile?.followers === 'number' && (s.profile!.followers as number) > 0)
    .map((s) => ({ source: s.source, followers: s.profile!.followers as number }))
  if (followers.length > 0) out.followers = followers

  return out
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
{"summary":"","items":[{"what":"","source":"website|instagram|facebook|linkedin","date":"","kind":"launch|price|campaign|content|hiring|event|other","implication":""}]}`

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
    // Zero-extra-cost insights, computed from the SAME scrapes (no new calls).
    const insights = computeInsights(sources, recent)
    return { ...base, summary, items: recent, insights }
  } catch (e: any) {
    return { ...base, summary: `שגיאה בניתוח: ${e?.message || 'unknown'}` }
  }
}
