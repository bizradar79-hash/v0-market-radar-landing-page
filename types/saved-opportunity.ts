export type SourceType = 'weekly_action' | 'niche' | 'market_analysis'

export type SavedOpportunity = {
  id: string
  company_id: string
  source_type: SourceType
  source_id: string
  title: string
  summary?: string
  description?: string
  status: string
  saved_at: string
  last_ai_update: string
  user_notes: string
  revenue_potential_score: number
  estimated_revenue_min: number
  estimated_revenue_max: number
  confidence_score: number
  market_region: string
  industry_tag: string
}
