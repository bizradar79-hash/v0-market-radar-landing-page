export interface WeeklyAction {
  id: string
  title: string           // Short Hebrew title (max 60 chars)
  category: 'מכרז' | 'ליד' | 'מתחרה' | 'טרנד' | 'שיווק' | 'כנס' | 'כללי'
  priority: 'גבוהה' | 'בינונית' | 'נמוכה'
  effort: 'נמוך' | 'בינוני' | 'גבוה'   // Estimated effort
  summary: string         // 1–2 sentence explanation
  details: string         // Full action description (markdown-like, Hebrew)
  steps: string[]         // Ordered action steps
  why_this_week: string   // Why specifically this week
  expected_outcome: string
}

export interface WeeklyActionsData {
  fetchedAt: string       // ISO timestamp
  actions: WeeklyAction[]
}
