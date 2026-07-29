// Single shared "is this result the client?" matcher for GEO/SEO results, so the
// WRITE path (generate-geo-ranking), the READ path (lib/geo/read reconciliation)
// and the app GEO page all agree — no parallel matchers, no badge-vs-list drift.
//
// Reuses the Hebrew normalization from lib/match/hebrew-core (deSofit — final
// letters like ן/ם/ץ folded) so "שילן" matches inside "שילן שירותי המרה".

import { deSofit } from '@/lib/match/hebrew-core'
import { extractDomain } from '@/lib/dedup'

// Normalize a business name for matching: deSofit + lowercase, strip punctuation,
// drop company-suffix tokens, collapse whitespace.
export function normalizeText(s: string): string {
  return deSofit((s || '').toLowerCase())
    .replace(/["'’`״׳.,()|\[\]{}<>!?:;/\\_=+*&^%$#@~-]+/g, ' ')
    .replace(/\b(בע"?מ|בעמ|בע״מ|ltd|inc|llc|co|company)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Whitespace-free form for token containment: "Buy Carpet" / "buycarpet.co.il"
// and "שילן שירותי המרה" all collapse to a comparable token.
export function compactText(s: string): string {
  return normalizeText(s).replace(/\s+/g, '')
}

function brandTokenFromDomain(domain: string): string {
  const first = (domain || '').split('.')[0] || ''
  return first.replace(/[^a-z0-9֐-׿]/gi, '').toLowerCase()
}

export interface ClientIdentity {
  domain: string          // shilan.co.il
  brandTokens: string[]   // compacted brand tokens (latin AND Hebrew)
  names: string[]         // normalized full names/aliases for fuzzy contains
}

// Every identity the client may appear under: legal name, website domain + its
// brand token, explicit brandName, aliases — PLUS the compacted company name as a
// token (catches Hebrew brands in result text where the latin domain token can't).
export function buildClientIdentity(companyName: string, website: string, bp: any): ClientIdentity {
  const domain = extractDomain(website || '').toLowerCase().trim()
  const explicitBrand = typeof bp?.brandName === 'string' ? bp.brandName.trim() : ''
  const aliases: string[] = Array.isArray(bp?.aliases)
    ? bp.aliases.filter((a: any) => typeof a === 'string' && a.trim()) : []
  const brandTokens = Array.from(new Set(
    [brandTokenFromDomain(domain), compactText(explicitBrand), compactText(companyName), ...aliases.map(compactText)]
      .filter((t) => t.length >= 3),
  ))
  const names = Array.from(new Set(
    [companyName, explicitBrand, ...aliases].map(normalizeText).filter((n) => n.length >= 3),
  ))
  return { domain, brandTokens, names }
}

// True if a result is the client — matched by domain, brand token, or fuzzy name,
// against BOTH the result's `name` and `title`. Superset of the old write-time
// isOwnResult AND the page's isCompanyResult, so it can't miss where either hit.
export function isOwnGeoResult(r: any, identity: ClientIdentity): boolean {
  const url = (r?.url || '').toLowerCase().trim()
  if (identity.domain.length >= 3 && url.includes(identity.domain)) return true
  const urlCompact = compactText(url)
  const texts = [r?.name, r?.title].filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
  for (const t of texts) {
    const nameNorm = normalizeText(t)
    const nameCompact = compactText(t)
    for (const tok of identity.brandTokens) {
      if (tok.length >= 3 && (nameCompact.includes(tok) || urlCompact.includes(tok))) return true
    }
    if (nameNorm.length >= 3) {
      for (const nm of identity.names) {
        if (nm.length >= 3 && (nameNorm.includes(nm) || nm.includes(nameNorm))) return true
      }
    }
  }
  return false
}

// Reconcile a stored engine cell against its own results list: if the stored
// `appeared` flag is false but the client IS detectable in `results`, return the
// detected position. Used at read time so already-stored wrong flags self-heal.
export function reconcileOwnPosition(
  engine: { appeared?: boolean; position?: number | string | null; results?: any[] } | null | undefined,
  identity: ClientIdentity | null | undefined,
): { appeared: boolean; position: number | string | null } {
  const storedAppeared = !!engine?.appeared && engine?.position != null
  if (storedAppeared) return { appeared: true, position: engine!.position as any }
  if (identity && Array.isArray(engine?.results)) {
    const own = engine!.results.find((r) => isOwnGeoResult(r, identity))
    if (own && own.position != null) return { appeared: true, position: own.position }
  }
  return { appeared: false, position: null }
}
