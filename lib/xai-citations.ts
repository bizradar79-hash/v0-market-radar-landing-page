// Extract REAL source URLs from an xAI Responses API payload (web_search
// grounding). These are links the search actually returned — never model-typed
// text. Used to attach honest "מקור" links to trends. If nothing was captured,
// callers must render NO link (never fabricate one).

export function isValidHttpUrl(u: unknown): u is string {
  if (typeof u !== 'string' || !u.trim()) return false
  try {
    const p = new URL(u)
    return (p.protocol === 'https:' || p.protocol === 'http:') && p.hostname.length > 0
  } catch {
    return false
  }
}

/** Collect citation URLs from both xAI shapes: top-level `citations: string[]`
 *  and OpenAI-style `output[].content[].annotations[]` url citations. */
export function extractXaiCitations(raw: any): string[] {
  const found: string[] = []
  if (Array.isArray(raw?.citations)) {
    for (const c of raw.citations) if (typeof c === 'string') found.push(c)
  }
  const output = Array.isArray(raw?.output) ? raw.output : []
  for (const item of output) {
    const contents = Array.isArray(item?.content) ? item.content : []
    for (const c of contents) {
      const anns = Array.isArray(c?.annotations) ? c.annotations : []
      for (const a of anns) {
        const u = a?.url ?? a?.url_citation?.url
        if (typeof u === 'string') found.push(u)
      }
    }
  }
  const seen = new Set<string>()
  const valid: string[] = []
  for (const u of found) {
    if (!isValidHttpUrl(u)) continue
    const href = new URL(u).href
    if (!seen.has(href)) { seen.add(href); valid.push(href) }
  }
  return valid
}

/** A model-proposed URL is kept ONLY if it matches a real grounding citation
 *  (exact href or same hostname) — guarantees we never store an invented link. */
export function validateAgainstCitations(proposed: unknown, citations: string[]): string | null {
  if (!isValidHttpUrl(proposed) || citations.length === 0) return null
  try {
    const p = new URL(proposed)
    for (const c of citations) {
      const cu = new URL(c)
      if (cu.href === p.href) return cu.href
      if (cu.hostname.replace(/^www\./, '') === p.hostname.replace(/^www\./, '')) return c
    }
  } catch { /* fall through */ }
  return null
}
