'use client'

import { useState, useEffect } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import type { SavedOpportunity } from '@/types/saved-opportunity'

const sourceLabel: Record<string, string> = {
  weekly_action:   'פעולה שבועית 🚀',
  niche:           'נישה 🔍',
  market_analysis: 'ניתוח שוק 📊',
}

const sourceBadgeColor: Record<string, string> = {
  weekly_action:   'bg-yellow-100 text-yellow-700 border-yellow-200',
  niche:           'bg-blue-100 text-blue-700 border-blue-200',
  market_analysis: 'bg-teal-100 text-teal-700 border-teal-200',
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}.${mm}.${yyyy}`
}

function scoreBarColor(score: number): string {
  if (score >= 75) return 'bg-orange-500'
  if (score >= 50) return 'bg-green-500'
  if (score >= 25) return 'bg-blue-500'
  return 'bg-gray-400'
}

interface Props {
  opp: SavedOpportunity | null
  open: boolean
  onClose: () => void
  onNotesSave: (id: string, notes: string) => void
}

export default function SavedOpportunityDetailsPanel({ opp, open, onClose, onNotesSave }: Props) {
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (opp) setNotes(opp.user_notes || '')
  }, [opp])

  function handleNotesBlur() {
    if (!opp) return
    if (notes !== opp.user_notes) onNotesSave(opp.id, notes)
  }

  return (
    <Sheet open={open} onOpenChange={o => { if (!o) onClose() }}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto" dir="rtl">
        {opp && (
          <div className="space-y-5 text-right">
            <SheetHeader>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={`text-xs ${sourceBadgeColor[opp.source_type] || ''}`}>
                  {sourceLabel[opp.source_type] || opp.source_type}
                </Badge>
                <Badge variant="outline" className="text-xs text-muted-foreground">{opp.status}</Badge>
              </div>
              <SheetTitle className="text-lg leading-snug mt-1">{opp.title}</SheetTitle>
              <p className="text-xs text-muted-foreground">נשמר: {formatDate(opp.saved_at)}</p>
            </SheetHeader>

            {/* Summary / Description */}
            {(opp.summary || opp.description) && (
              <div className="rounded-lg bg-muted/40 border p-3">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {opp.description || opp.summary}
                </p>
              </div>
            )}

            {/* Revenue */}
            {(opp.estimated_revenue_min > 0 || opp.estimated_revenue_max > 0) && (
              <div className="rounded-lg border p-4 space-y-3 bg-orange-50/30">
                <p className="text-sm font-semibold">פוטנציאל הכנסה 💰</p>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">הכנסה חודשית משוערת</p>
                    <p className="font-semibold text-sm break-words">
                      ₪{opp.estimated_revenue_min.toLocaleString()} – ₪{opp.estimated_revenue_max.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">ביטחון</p>
                    <p className="font-semibold text-sm">{opp.confidence_score}%</p>
                  </div>
                </div>
                {opp.revenue_potential_score > 0 && (
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>ציון פוטנציאל</span>
                      <span className="font-medium">{opp.revenue_potential_score}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-orange-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${scoreBarColor(opp.revenue_potential_score)}`}
                        style={{ width: `${Math.min(100, opp.revenue_potential_score)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Source-type specific metadata */}
            {opp.source_type === 'niche' && (
              <div className="space-y-2">
                {(opp.market_region || opp.industry_tag) && (
                  <div className="flex flex-wrap gap-2">
                    {opp.market_region && (
                      <Badge variant="outline" className="text-xs text-muted-foreground">{opp.market_region}</Badge>
                    )}
                    {opp.industry_tag && (
                      <Badge variant="outline" className="text-xs bg-indigo-50 text-indigo-700 border-indigo-200">{opp.industry_tag}</Badge>
                    )}
                  </div>
                )}
              </div>
            )}

            {opp.source_type === 'market_analysis' && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {opp.market_region && (
                    <Badge variant="outline" className="text-xs text-muted-foreground">{opp.market_region}</Badge>
                  )}
                  {opp.industry_tag && (
                    <Badge variant="outline" className="text-xs bg-teal-50 text-teal-700 border-teal-200">{opp.industry_tag}</Badge>
                  )}
                </div>
              </div>
            )}

            {opp.source_type === 'weekly_action' && opp.industry_tag && (
              <div>
                <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200">{opp.industry_tag}</Badge>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <p className="text-sm font-semibold">הערות</p>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                onBlur={handleNotesBlur}
                placeholder="הוסף הערה אישית..."
                rows={4}
                className="w-full text-sm rounded-lg border border-border bg-muted/30 px-3 py-2 text-right resize-none focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/50"
                dir="rtl"
              />
              <p className="text-xs text-muted-foreground/60">ההערות נשמרות אוטומטית בעת יציאה מהשדה</p>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
