// Shared reader for a company's stored GEO (AI-engine) ranking, used by the web
// report (and mirroring how the app GEO page reads the SAME structure).
//
// Two deliberate design points (both fix empty-GEO bugs honestly):
//  1. Drive the question list from the KEYS of geo_ranking.queryResults — the
//     questions that were ACTUALLY measured — never from geo_ranking.queries
//     (which can drift/mismatch; the old exact-string lookup dropped everything).
//  2. If queryResults is empty/absent but the primary `engines` is populated,
//     return EXACTLY ONE question (the primary). We do NOT copy the primary
//     engines across 3 rows like a naive page-fallback would — that implies 3
//     measurements when only one exists.
//
// Per engine: ranked = `eng.appeared && eng.position != null`. Position is checked
// with `!= null` (NOT a strict-number cast) — engine positions come from parsed
// LLM JSON and may be a numeric string ("2"); the page accepts those, so we do too.

export interface GeoEngineCell {
  id: 'chatgpt' | 'gemini' | 'grok'
  name: string
  position: number | string | null
  appeared: boolean
}
export interface GeoQuestion {
  question: string
  engines: GeoEngineCell[]
  hasEngineData: boolean // the stored data actually had ≥1 engine object for this question
}

const ENGINE_TABS: Array<{ id: GeoEngineCell['id']; name: string }> = [
  { id: 'chatgpt', name: 'ChatGPT' },
  { id: 'gemini', name: 'Gemini' },
  { id: 'grok', name: 'Grok' },
]

function cell(id: GeoEngineCell['id'], name: string, e: any): GeoEngineCell {
  const appeared = !!e?.appeared && e?.position != null // EXACT page condition (lenient)
  return { id, name, position: appeared ? e.position : null, appeared }
}

/**
 * Up to `max` GEO questions, each with the client's position per engine.
 * Reads the authoritative per-question map (queryResults keyed by question, in
 * `queries` order), falling back to the primary `engines`+`query`, then the
 * legacy single-question shape (userPosition/userMentioned) — the same shapes
 * the app page supports. Pure read, no network.
 */
export function readGeoQuestions(geoRanking: any, max = 3): GeoQuestion[] {
  if (!geoRanking || typeof geoRanking !== 'object') return []

  const queries: string[] = Array.isArray(geoRanking.queries)
    ? geoRanking.queries.filter((q: any) => typeof q === 'string' && q.trim())
    : []
  const qr = geoRanking.queryResults && typeof geoRanking.queryResults === 'object'
    ? (geoRanking.queryResults as Record<string, any>) : null

  // Build [question, enginesObject] pairs.
  let entries: Array<{ question: string; engines: any }> = []
  if (qr && Object.keys(qr).length) {
    // Drive the list from what was ACTUALLY measured — the queryResults KEYS —
    // not from `queries` (which can drift / mismatch and dropped everything).
    // Preserve the configured `queries` order for keys that exist, then append
    // any measured keys not listed in `queries`.
    const qrKeys = Object.keys(qr)
    const ordered = queries.length
      ? [...queries.filter((q) => q in qr), ...qrKeys.filter((k) => !queries.includes(k))]
      : qrKeys
    entries = ordered.slice(0, max).map((q) => ({ question: q, engines: qr[q] }))
  } else if (geoRanking.engines && (geoRanking.query || queries.length)) {
    // No per-question map, but the primary engines ARE populated → return EXACTLY
    // ONE honest question (the primary). Never duplicate it across 3 rows — that
    // would imply 3 measurements when only one exists.
    entries = [{ question: geoRanking.query || queries[0] || '', engines: geoRanking.engines }]
  } else if (geoRanking.query) {
    // Legacy single-question shape: position lived on userPosition/userMentioned.
    entries = [{ question: geoRanking.query, engines: { chatgpt: { appeared: geoRanking.userMentioned, position: geoRanking.userPosition } } }]
  }

  return entries.map(({ question, engines }) => {
    const eng = engines && typeof engines === 'object' ? engines : {}
    const hasEngineData = !!(eng.chatgpt || eng.gemini || eng.grok)
    return {
      question: String(question),
      engines: ENGINE_TABS.map((t) => cell(t.id, t.name, eng[t.id])),
      hasEngineData,
    }
  })
}
