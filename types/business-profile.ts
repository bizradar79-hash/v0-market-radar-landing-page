export type BusinessProfile = {
  coreActivity: string
  businessModel: 'B2B' | 'B2C' | 'B2B2C' | 'mixed'
  companyStage: 'startup' | 'growing' | 'established' | 'enterprise'
  products: Array<{
    name: string
    description: string
    targetAudience: string
    priceRange?: string
  }>
  targetAudiences: string[]
  industryTags: string[]
  geographicMarkets: string[]
  competitiveAdvantage: string
  marketPosition: string
  directCompetitors: string[]
  primaryKeywords: string[]
  secondaryKeywords: string[]
  searchQueries: string[]
  // GEO presence-check queries: exactly 3 SHORT NATURAL-LANGUAGE questions
  // (~6-12 words, one intent) a user would ask ChatGPT/Gemini about this
  // business's domain (Hebrew), e.g. "מה חנות השטיחים הכי טובה במרכז?".
  // Distinct from the short product terms in company.keywords
  // (trends/SEO/tenders) and from searchQueries (news/leads).
  // Auto-generated ONCE on the first GEO scan and persisted so they stay stable
  // week-to-week. Admins can add/edit/remove; clients may delete individual
  // questions (the next scan refills the list back up to 3).
  geoQueries?: string[]
  // How the business is actually KNOWN to customers / AI engines, used to match
  // it inside GEO results. The legal name (companies.name, e.g.
  // "שטיחים בסנטר ב.ש בע"מ") often differs from the brand the engines list
  // (e.g. "BuyCarpet" / buycarpet.co.il). brandName is the customer-facing
  // brand; if empty it's derived from the website domain at match time.
  // aliases are any additional names the engines might use.
  brandName?: string
  aliases?: string[]
  distributionChannels: string[]
  confidenceScore: number
  sourcesUsed: string[]
  generatedAt: string
}
