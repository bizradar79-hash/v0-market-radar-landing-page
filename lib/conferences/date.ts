// Shared comparable-date logic for conferences, used by BOTH display paths (the
// conferences page and the web report) and by generation — so "is this event in
// the past?" is decided identically everywhere and can't drift.
//
// The stored `date` column is FREE TEXT: real events come back as ISO
// ("2026-08-15"), but also as vague Hebrew ("אמצע אוגוסט 2026", "סוף 2026") or
// unknown ("יוכרז"). We derive a CONSERVATIVE comparable date — the LAST day the
// event could plausibly still be running — so an event is only treated as past
// when it definitely is.

export type DatePrecision = 'day' | 'month' | 'quarter' | 'unknown'

export interface ParsedConferenceDate {
  /** Last plausible day of the event window, YYYY-MM-DD. null when unknown. */
  comparable: string | null
  precision: DatePrecision
}

const pad = (n: number) => String(n).padStart(2, '0')
const endOfMonth = (y: number, m: number) => `${y}-${pad(m)}-${new Date(y, m, 0).getDate()}`

// Hebrew + English month names → month number.
const MONTHS: Array<[RegExp, number]> = [
  [/ינואר|january|jan\b/i, 1], [/פברואר|february|feb\b/i, 2], [/מרץ|מרס|march|mar\b/i, 3],
  [/אפריל|april|apr\b/i, 4], [/מאי|may\b/i, 5], [/יוני|june|jun\b/i, 6],
  [/יולי|july|jul\b/i, 7], [/אוגוסט|august|aug\b/i, 8], [/ספטמבר|september|sep\b/i, 9],
  [/אוקטובר|october|oct\b/i, 10], [/נובמבר|november|nov\b/i, 11], [/דצמבר|december|dec\b/i, 12],
]

/**
 * Derive a comparable date from a conference's stored date text.
 * Conservative by design: a month yields that month's LAST day, "סוף 2026"
 * yields 2026-12-31 — so we never call an event past while it might still run.
 */
export function parseConferenceDate(raw: string | null | undefined): ParsedConferenceDate {
  const s = String(raw ?? '').trim()
  if (!s) return { comparable: null, precision: 'unknown' }

  // 1. Exact ISO date (what generation now asks for).
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return { comparable: `${iso[1]}-${iso[2]}-${iso[3]}`, precision: 'day' }

  // 2. ISO year-month → end of that month.
  const ym = s.match(/(\d{4})-(\d{2})(?!\d)/)
  if (ym) {
    const y = +ym[1], m = +ym[2]
    if (m >= 1 && m <= 12) return { comparable: endOfMonth(y, m), precision: 'month' }
  }

  // 3. D/M/YYYY or D.M.YYYY.
  const dmy = s.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/)
  if (dmy) {
    const d = +dmy[1], m = +dmy[2], y = +dmy[3]
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return { comparable: `${y}-${pad(m)}-${pad(d)}`, precision: 'day' }
  }

  const year = s.match(/\b(20\d{2})\b/)
  const y = year ? +year[1] : null

  // 4. Month name (+ year) → end of that month. Handles "אמצע אוגוסט 2026".
  for (const [re, m] of MONTHS) {
    if (re.test(s)) {
      const yy = y ?? new Date().getFullYear()
      return { comparable: endOfMonth(yy, m), precision: 'month' }
    }
  }

  // 5. Vague period within a year → end of that period (conservative).
  if (y) {
    if (/רבעון\s*(1|ראשון)|q1/i.test(s)) return { comparable: endOfMonth(y, 3), precision: 'quarter' }
    if (/רבעון\s*(2|שני)|q2/i.test(s)) return { comparable: endOfMonth(y, 6), precision: 'quarter' }
    if (/רבעון\s*(3|שלישי)|q3/i.test(s)) return { comparable: endOfMonth(y, 9), precision: 'quarter' }
    if (/רבעון\s*(4|רביעי)|q4/i.test(s)) return { comparable: endOfMonth(y, 12), precision: 'quarter' }
    if (/תחילת|ראשית|early/i.test(s)) return { comparable: endOfMonth(y, 4), precision: 'quarter' }
    if (/אמצע|mid/i.test(s)) return { comparable: endOfMonth(y, 8), precision: 'quarter' }
    if (/סוף|late|end/i.test(s)) return { comparable: endOfMonth(y, 12), precision: 'quarter' }
    // Bare year → end of year.
    return { comparable: endOfMonth(y, 12), precision: 'quarter' }
  }

  // 6. "יוכרז" / "TBA" / anything unparseable.
  return { comparable: null, precision: 'unknown' }
}

/** Today as YYYY-MM-DD (local), the comparison anchor. */
export function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

/**
 * TRUE only when the event is definitely over. Unknown-precision dates are NOT
 * past (we can't disprove they're upcoming) — they're shown labeled instead.
 */
export function isPastConference(raw: string | null | undefined, today = todayISO()): boolean {
  const { comparable } = parseConferenceDate(raw)
  if (!comparable) return false
  return comparable < today
}

/** Keep only conferences that aren't definitely over. Shared by page + report. */
export function filterUpcomingConferences<T extends { date?: string | null }>(rows: T[] | null | undefined): T[] {
  const today = todayISO()
  return (rows || []).filter((c) => !isPastConference(c?.date, today))
}

/** Label for a vague/unknown date, so the UI never shows a blank or a stale text. */
export const TBA_LABEL = 'מועד יוכרז'

/** Display text for a conference date: the original text, or the TBA label. */
export function conferenceDateLabel(raw: string | null | undefined): string {
  const s = String(raw ?? '').trim()
  if (!s) return TBA_LABEL
  return parseConferenceDate(s).precision === 'unknown' ? TBA_LABEL : s
}
