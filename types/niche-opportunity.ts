export type SignalType = 'trend' | 'lead' | 'tender' | 'conference' | 'competitor' | 'news'

export interface NicheSignal {
  id: string
  type: SignalType
  title: string
  source: string
  date: string
  relevanceScore: number  // 0–100
  sourceRoute: string     // internal link e.g. "/app/trends"
  externalUrl?: string
}

export type NicheStatus = 'new' | 'tracking' | 'ignored'

export interface NicheOpportunity {
  id: string
  nicheTitle: string
  shortInsightSummary: string
  opportunityScore: number       // 0–100
  confidenceScore: number        // 0–100
  signals: NicheSignal[]
  demandTrend: 'עולה' | 'יציב' | 'יורד'
  competitionLevel: 'נמוכה' | 'בינונית' | 'גבוהה'
  estimatedLeadPotential: string // e.g. "8–15 לידים"
  estimatedMarketSize: string    // e.g. "₪2M–5M שנתי"
  region: string
  category: string
  whyThisNicheFitsYourBusiness: string
  strategicNextSteps: string[]
  relatedKeywords: string[]
  relatedCompetitors: string[]
  status: NicheStatus
}

export interface NicheOpportunityData {
  fetchedAt: string
  opportunities: NicheOpportunity[]
}
