// ─────────────────────────────────────────────────────────────────────────
// Shared summarizer for the NEW keyword_trends shape (DataForSEO Google Ads).
//
// keyword_trends is a JSONB Record on companies, keyed by keyword, each value a
// StoredKeyword built in app/api/generate-keyword-trends/route.ts. BOTH the
// weekly-actions and niche-opportunities prompts feed off this single helper so
// their keyword reading can NEVER diverge again (the old code read an obsolete
// `kwData.israel/.trends/.phrase` shape that no longer exists → always empty).
//
// Output: a lean list of Hebrew prompt lines (≤ MAX_LINES), ranked by
// opportunity (rising + real volume first), plus the best long-tail openings.
// Separates PAID signal (תחרות פרסומית / CPC) from ORGANIC demand explicitly.
// ─────────────────────────────────────────────────────────────────────────

export interface SummRelated {
  keyword: string
  searchVolume?: number
  changePct?: number
  direction?: string
  directionHe?: string
  competition?: string
  competitionHe?: string
  cpc?: number
  opportunityLevel?: 'hot' | 'good' | null
}

export interface SummKeyword {
  keyword: string
  searchVolume?: number
  changePct?: number
  direction?: string        // 'rising' | 'falling' | 'stable'
  directionHe?: string
  competition?: string      // 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN'
  competitionHe?: string
  cpc?: number
  related?: SummRelated[]
}

const MAX_LINES = 8

export interface KeywordIntelRow {
  keyword: string
  searchVolume: number
  direction: string         // 'rising' | 'falling' | 'stable'
  directionHe: string
  changePct: number
  competition: string       // 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN'
  competitionHe: string
  cpc: number
  insight: string
}

export interface KeywordOpportunityRow {
  keyword: string
  searchVolume: number
  direction: string
  directionHe: string
  changePct: number
  opportunityLevel: 'hot' | 'good' | null
  seedKeyword: string
}

export interface KeywordIntel {
  keywords: KeywordIntelRow[]
  opportunities: KeywordOpportunityRow[]
}

function num(v: unknown): number {
  return typeof v === 'number' && isFinite(v) ? v : 0
}

function fmtVol(v: number): string {
  return v.toLocaleString('he-IL')
}

function fmtPct(v: number): string {
  if (!v) return '0%'
  return `${v > 0 ? '+' : ''}${v}%`
}

// Rank: rising keywords first, then by absolute search volume.
function keywordPriority(k: SummKeyword): number {
  const vol = num(k.searchVolume)
  const risingBonus = k.direction === 'rising' ? 1_000_000 : k.direction === 'stable' ? 0 : -1_000_000
  return risingBonus + vol
}

function dirHeOf(v: { directionHe?: string; direction?: string }): string {
  return v.directionHe || (v.direction === 'rising' ? 'עולה' : v.direction === 'falling' ? 'יורד' : 'יציב')
}

export interface SummarizeOptions {
  maxLines?: number          // cap headline keyword lines (default MAX_LINES)
  maxOpportunities?: number  // cap long-tail opportunity lines (default 3)
}

/**
 * Turn the stored keyword_trends Record into prompt-ready Hebrew lines.
 * Returns ["אין נתוני מילות מפתח"] when there is nothing usable — never throws.
 *
 * Pass opts.maxLines (e.g. a large number) to include ALL client keywords — the
 * monthly report does this so the AI sees every real keyword, not a top-N slice.
 */
export function summarizeKeywordTrends(
  kt: Record<string, any> | null | undefined,
  opts?: SummarizeOptions,
): string[] {
  if (!kt || typeof kt !== 'object') return ['אין נתוני מילות מפתח']

  const maxLines = opts?.maxLines ?? MAX_LINES
  const maxOpps = opts?.maxOpportunities ?? 3

  const keywords: SummKeyword[] = Object.values(kt)
    .filter((v): v is SummKeyword => !!v && typeof v === 'object' && typeof (v as any).keyword === 'string')

  if (keywords.length === 0) return ['אין נתוני מילות מפתח']

  const ranked = [...keywords].sort((a, b) => keywordPriority(b) - keywordPriority(a))

  const lines: string[] = []

  // 1) Headline keyword lines — paid vs organic signals kept separate.
  for (const k of ranked) {
    if (lines.length >= maxLines) break
    const vol = num(k.searchVolume)
    const dirHe = dirHeOf(k)
    const compHe = k.competitionHe || '—'
    const cpc = num(k.cpc)
    lines.push(
      `"${k.keyword}": ${fmtVol(vol)} חיפושים/חודש, ${dirHe} ${fmtPct(num(k.changePct))}, ` +
      `תחרות פרסומית ${compHe}, CPC $${cpc}`
    )
  }

  // 2) Best long-tail openings — only badged opportunities (hot/good), best first.
  const opps = collectOpportunities(ranked)
  for (const r of opps.slice(0, maxOpps)) {
    if (lines.length >= maxLines + maxOpps) break
    lines.push(`הזדמנות long-tail: "${r.keyword}" ${fmtVol(num(r.searchVolume))} חיפושים, ${dirHeOf(r)}`)
  }

  return lines.length > 0 ? lines : ['אין נתוני מילות מפתח']
}

function collectOpportunities(ranked: SummKeyword[]): Array<SummRelated & { seedKeyword: string }> {
  const opps: Array<SummRelated & { seedKeyword: string }> = []
  for (const k of ranked) {
    for (const r of k.related || []) {
      if (r && (r.opportunityLevel === 'hot' || r.opportunityLevel === 'good')) {
        opps.push({ ...r, seedKeyword: k.keyword })
      }
    }
  }
  opps.sort((a, b) => {
    const lvl = (x?: string | null) => (x === 'hot' ? 2 : x === 'good' ? 1 : 0)
    return lvl(b.opportunityLevel) - lvl(a.opportunityLevel) || num(b.searchVolume) - num(a.searchVolume)
  })
  return opps
}

/**
 * Structured, deterministic keyword intelligence for the monthly report JSON.
 * Returns REAL numbers (volume/CPC/change) straight from keyword_trends — never
 * AI-invented. Includes ALL client keywords (ranked rising-first, then volume).
 * Returns empty arrays when there is nothing usable — never throws.
 */
export function buildKeywordIntel(kt: Record<string, any> | null | undefined): KeywordIntel {
  const empty: KeywordIntel = { keywords: [], opportunities: [] }
  if (!kt || typeof kt !== 'object') return empty

  const keywords: SummKeyword[] = Object.values(kt)
    .filter((v): v is SummKeyword => !!v && typeof v === 'object' && typeof (v as any).keyword === 'string')

  if (keywords.length === 0) return empty

  const ranked = [...keywords].sort((a, b) => keywordPriority(b) - keywordPriority(a))

  const rows: KeywordIntelRow[] = ranked.map((k) => ({
    keyword: k.keyword,
    searchVolume: num(k.searchVolume),
    direction: k.direction || 'stable',
    directionHe: dirHeOf(k),
    changePct: num(k.changePct),
    competition: k.competition || 'UNKNOWN',
    competitionHe: k.competitionHe || '—',
    cpc: num(k.cpc),
    insight: (k as any).insight && typeof (k as any).insight === 'string'
      ? (k as any).insight
      : buildRowInsight(k),
  }))

  const opportunities: KeywordOpportunityRow[] = collectOpportunities(ranked).map((r) => ({
    keyword: r.keyword,
    searchVolume: num(r.searchVolume),
    direction: r.direction || 'stable',
    directionHe: dirHeOf(r),
    changePct: num(r.changePct),
    opportunityLevel: r.opportunityLevel ?? null,
    seedKeyword: r.seedKeyword,
  }))

  return { keywords: rows, opportunities }
}

// Fallback Hebrew insight when the stored keyword has no insight string.
function buildRowInsight(k: SummKeyword): string {
  const vol = num(k.searchVolume)
  const pct = num(k.changePct)
  if (k.direction === 'rising') {
    return `ביקוש עולה (${fmtPct(pct)}) על ${fmtVol(vol)} חיפושים/חודש — שווה להשקיע בתוכן אורגני סביב מילה זו`
  }
  if (k.direction === 'falling') {
    return `ביקוש נחלש (${fmtPct(pct)}) — לעקוב, לא להגדיל השקעה כרגע`
  }
  return `ביקוש יציב על ${fmtVol(vol)} חיפושים/חודש — בסיס קבוע לתנועה אורגנית`
}
