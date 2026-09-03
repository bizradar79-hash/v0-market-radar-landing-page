// Single source of truth for a company's tracking keywords.
//
// company.keywords (the user-managed text[] column, edited in settings) is
// AUTHORITATIVE — it drives SEO, keyword_trends, tenders, news, etc. For legacy
// clients whose column is still empty we fall back, at READ time, to
// business_profile.primaryKeywords (no destructive backfill needed). New clients
// always get company.keywords populated at onboarding, so the fallback is
// transitional only.

type HasKeywords = { keywords?: string[] | null } | null | undefined
type HasPrimary = { primaryKeywords?: string[] | null } | null | undefined

function clean(arr: unknown): string[] {
  return Array.isArray(arr)
    ? arr.filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
    : []
}

export function effectiveKeywords(company: HasKeywords, businessProfile?: HasPrimary): string[] {
  const ck = clean(company?.keywords)
  if (ck.length) return ck
  return clean(businessProfile?.primaryKeywords)
}

// ── Query construction ──────────────────────────────────────────────────────
// A multi-word keyword is a PHRASE, and splitting it changes its meaning. For a
// Chinese-acupuncture clinic, keywords like "דיקור סיני" / "רפואה סינית" were
// joined into a bare word bag — `דיקור סיני רפואה סינית חדשות ישראל` — which a
// search engine happily satisfies with "סיני" + "חדשות ישראל", i.e. news about
// CHINA. Quoting keeps each phrase intact so it can only match the field.

/** True when a keyword is a multi-word phrase that must not be split. */
export function isPhrase(kw: string): boolean {
  return kw.trim().split(/\s+/).length > 1
}

/**
 * Build a search query from keywords, keeping multi-word terms as quoted
 * phrases. Single words pass through unquoted (quoting them adds nothing).
 */
export function phraseQuery(keywords: string[], limit = 3): string {
  return clean(keywords)
    .slice(0, limit)
    .map((k) => {
      const t = k.trim()
      return isPhrase(t) ? `"${t}"` : t
    })
    .join(' ')
}

type HasIndustry = { industry?: string | null; description?: string | null } | null | undefined
type HasProfile = { coreActivity?: string | null; industryTags?: string[] | null } | null | undefined

/**
 * A short FIELD anchor — the client's industry / core activity — appended to a
 * query so results are about their profession, not a country or a generic word
 * that happens to appear in their keywords. Two words max: longer text narrows
 * a search engine too aggressively.
 */
export function fieldAnchor(company: HasIndustry, businessProfile?: HasProfile): string {
  const raw = [
    businessProfile?.industryTags?.find((t) => typeof t === 'string' && t.trim()),
    company?.industry,
    businessProfile?.coreActivity,
    company?.description,
  ].map((v) => String(v || '').trim()).find(Boolean) || ''
  const words = raw.split(/[,·|—-]/)[0].trim().split(/\s+/).slice(0, 2).join(' ')
  return words
}

/**
 * The full search subject for a client: their field phrases plus the industry
 * anchor, with the anchor dropped when the keywords already contain it.
 */
export function searchSubject(
  keywords: string[], company: HasIndustry, businessProfile?: HasProfile, limit = 3,
): string {
  const phrases = phraseQuery(keywords, limit)
  const anchor = fieldAnchor(company, businessProfile)
  if (!anchor) return phrases
  if (!phrases) return anchor
  // Don't repeat a word the phrases already carry.
  const have = phrases.toLowerCase()
  const add = anchor.split(/\s+/).filter((w) => w && !have.includes(w.toLowerCase()))
  return add.length ? `${phrases} ${add.join(' ')}` : phrases
}
