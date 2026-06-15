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
  // GEO presence-check queries: 3-5 NATURAL-LANGUAGE questions a user would ask
  // ChatGPT/Gemini about this business's domain (Hebrew), e.g.
  // "מה חנות השטיחים הכי טובה במרכז?". Distinct from the short product terms in
  // company.keywords (trends/SEO/tenders) and from searchQueries (news/leads).
  // Auto-generated ONCE on the first GEO scan and persisted so they stay stable
  // week-to-week; managed by admins, shown read-only to clients.
  geoQueries?: string[]
  distributionChannels: string[]
  confidenceScore: number
  sourcesUsed: string[]
  generatedAt: string
}
