export interface ActionSignal {
  type: 'trend' | 'competitor' | 'tender' | 'news' | 'lead' | 'conference' | 'keyword'
  label: string        // short display text, e.g. "טרנד: מיצוי אולטראסוני עולה"
  description: string  // 1 sentence why this is relevant NOW
  sourceRoute: string  // internal link e.g. "/app/trends", "/app/tenders"
  sourceId?: string    // optional — ID of the specific item in DB
  externalUrl?: string // optional — external URL (news article, tender page, etc.)
}

export interface WeeklyAction {
  id: string
  title: string           // Short Hebrew title (max 60 chars)
  category: 'מכרז' | 'ליד' | 'מתחרה' | 'טרנד' | 'שיווק' | 'כנס' | 'כללי'
  priority: 'גבוהה' | 'בינונית' | 'נמוכה'
  effort: 'נמוך' | 'בינוני' | 'גבוה'
  summary: string         // 1–2 sentence explanation
  details: string         // Full action description
  steps: string[]         // Ordered action steps
  why_this_week?: string  // Kept for backwards compat with cached data
  signals: ActionSignal[] // Verifiable signals from real system data
  expected_outcome: string
}

export interface WeeklyActionsData {
  fetchedAt: string       // ISO timestamp
  actions: WeeklyAction[]
}
