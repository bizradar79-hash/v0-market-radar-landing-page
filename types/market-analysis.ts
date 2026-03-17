export type SignalType = 'trend' | 'lead' | 'tender' | 'conference' | 'competitor' | 'news'

export interface AnalysisSignal {
  id: string
  type: SignalType
  title: string
  source: string
  date: string
  relevanceScore: number
  sourceRoute: string
  externalUrl?: string
}

export type MarketMomentum = 'עולה' | 'יציב' | 'רווי' | 'בירידה'

export interface MarketAnalysis {
  id: string
  query: string
  region: string
  category: string
  summary: string
  demandScore: number        // 0–100
  competitionScore: number   // 0–100
  gapScore: number           // 0–100
  leadPotential: string      // e.g. "10–20 לידים"
  marketMomentum: MarketMomentum
  signals: AnalysisSignal[]
  opportunities: string[]
  risks: string[]
  strategicRecommendations: string[]
  createdAt: string
}
