// ─────────────────────────────────────────────────────────────────────────
// Single source of truth for a business's GEOGRAPHIC AREA.
//
// Background: `companies.geographic_scope` (['local'|'national'|'international'])
// is what the client actually edits (onboarding + settings). The columns
// `companies.city` / `companies.geographic_area` are legacy and were never
// written by the current app — some rows still carry a stale 'כל הארץ' literal
// that silently overrode the real choice in the report and in lead targeting.
//
// deriveArea() resolves scope → a display label (for the report) and a search
// label (for lead geo-targeting), centralizing the 'כל הארץ' handling so the
// old per-reader defensive guards can be removed.
// ─────────────────────────────────────────────────────────────────────────

import type { BusinessProfile } from '@/types/business-profile'

// The legacy "national" literal that leaked into city/geographic_area.
export const NATIONAL_LITERAL = 'כל הארץ'

export interface AreaLabels {
  display: string          // report "אזור פעילות"
  search: string           // lead geo-targeting / query location hint
  isLocal: boolean
  isInternational: boolean
}

// Scope column may be a text[] or a bare text; missing → national.
export function scopesOf(company: any): string[] {
  const raw = company?.geographic_scope
  return Array.isArray(raw) ? raw : [raw || 'national']
}

const clean = (s: any): string =>
  typeof s === 'string' && s.trim() && s.trim() !== NATIONAL_LITERAL ? s.trim() : ''

/**
 * Resolve a company's geographic area from its scope. Local businesses draw the
 * real location from city → geographic_area → business_profile.geographicMarkets
 * (all filtered of the stale 'כל הארץ' literal); national → "כל הארץ" (display) /
 * "ישראל" (search); international → "ישראל ובינלאומי" / "ישראל ועולם".
 */
export function deriveArea(company: any, businessProfile?: BusinessProfile | null): AreaLabels {
  const scopes = scopesOf(company)
  const isInternational = scopes.includes('international')
  const isLocal = scopes.includes('local')

  if (isLocal) {
    const city = clean(company?.city)
    const geoArea = (Array.isArray(company?.geographic_area) ? company.geographic_area : [])
      .map(clean).filter(Boolean)
    const bpMarket = (businessProfile?.geographicMarkets || []).map(clean).find(Boolean) || ''
    const loc = city || geoArea.join(', ') || bpMarket || 'ישראל'
    return { display: loc, search: loc, isLocal: true, isInternational }
  }

  if (isInternational) {
    return { display: 'ישראל ובינלאומי', search: 'ישראל ועולם', isLocal: false, isInternational: true }
  }

  // national (or missing)
  return { display: NATIONAL_LITERAL, search: 'ישראל', isLocal: false, isInternational: false }
}
