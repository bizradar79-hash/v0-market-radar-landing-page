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
  distributionChannels: string[]
  confidenceScore: number
  sourcesUsed: string[]
  generatedAt: string
}
