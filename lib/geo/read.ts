// Single shared reader for a company's stored GEO (AI-engine) ranking, so the
// web report and the app's GEO page can't drift on the stored shape.
//
// Access path mirrors app/app/seo-geo/page.tsx EXACTLY:
//   activeEngines = geo_ranking.queryResults[question] ?? geo_ranking.engines
//   eng           = activeEngines[engineId]            // { position, appeared, results, topResults }
//   ranked        = eng.appeared && eng.position != null
// Crucially, position is checked with `!= null` (NOT a strict-number cast) —
// engine positions come from parsed LLM JSON and may be a numeric string ("2");
// the page accepts those, so the report must too (this was the empty-GEO bug).

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

  // Build [question, enginesObject] pairs via the page's access path.
  let entries: Array<{ question: string; engines: any }> = []
  if (qr && queries.length) {
    // Multi-query: each question maps to its OWN engines (queries[i] are qr keys).
    entries = queries.slice(0, max).map((q) => ({ question: q, engines: qr[q] }))
  } else if (qr && Object.keys(qr).length) {
    entries = Object.entries(qr).slice(0, max).map(([q, e]) => ({ question: q, engines: e }))
  } else if (geoRanking.query && geoRanking.engines) {
    entries = [{ question: geoRanking.query, engines: geoRanking.engines }]
  } else if (geoRanking.query) {
    // Legacy single-question: the client's position lived on userPosition/userMentioned.
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
