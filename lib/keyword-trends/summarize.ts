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

/**
 * Turn the stored keyword_trends Record into prompt-ready Hebrew lines.
 * Returns ["אין נתוני מילות מפתח"] when there is nothing usable — never throws.
 */
export function summarizeKeywordTrends(kt: Record<string, any> | null | undefined): string[] {
  if (!kt || typeof kt !== 'object') return ['אין נתוני מילות מפתח']

  const keywords: SummKeyword[] = Object.values(kt)
    .filter((v): v is SummKeyword => !!v && typeof v === 'object' && typeof (v as any).keyword === 'string')

  if (keywords.length === 0) return ['אין נתוני מילות מפתח']

  const ranked = [...keywords].sort((a, b) => keywordPriority(b) - keywordPriority(a))

  const lines: string[] = []

  // 1) Headline keyword lines — paid vs organic signals kept separate.
  for (const k of ranked) {
    if (lines.length >= MAX_LINES) break
    const vol = num(k.searchVolume)
    const dirHe = k.directionHe || (k.direction === 'rising' ? 'עולה' : k.direction === 'falling' ? 'יורד' : 'יציב')
    const compHe = k.competitionHe || '—'
    const cpc = num(k.cpc)
    lines.push(
      `"${k.keyword}": ${fmtVol(vol)} חיפושים/חודש, ${dirHe} ${fmtPct(num(k.changePct))}, ` +
      `תחרות פרסומית ${compHe}, CPC $${cpc}`
    )
  }

  // 2) Best long-tail openings — only badged opportunities (hot/good), best first.
  const opps: Array<SummRelated & { _seed: string }> = []
  for (const k of ranked) {
    for (const r of k.related || []) {
      if (r && (r.opportunityLevel === 'hot' || r.opportunityLevel === 'good')) {
        opps.push({ ...r, _seed: k.keyword })
      }
    }
  }
  opps.sort((a, b) => {
    const lvl = (x?: string | null) => (x === 'hot' ? 2 : x === 'good' ? 1 : 0)
    return lvl(b.opportunityLevel) - lvl(a.opportunityLevel) || num(b.searchVolume) - num(a.searchVolume)
  })

  for (const r of opps.slice(0, 3)) {
    if (lines.length >= MAX_LINES) break
    const dirHe = r.directionHe || (r.direction === 'rising' ? 'עולה' : r.direction === 'falling' ? 'יורד' : 'יציב')
    lines.push(`הזדמנות long-tail: "${r.keyword}" ${fmtVol(num(r.searchVolume))} חיפושים, ${dirHe}`)
  }

  return lines.length > 0 ? lines : ['אין נתוני מילות מפתח']
}
