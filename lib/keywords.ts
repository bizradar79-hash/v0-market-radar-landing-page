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
