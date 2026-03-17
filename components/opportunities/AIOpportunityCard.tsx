"use client"

import { useState, useRef } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Trash2 } from "lucide-react"

export interface AIOpportunity {
  id: string
  company_id: string
  title: string
  description: string
  source_type: 'weekly' | 'niche' | 'market_analysis'
  revenue_potential_score: number
  estimated_revenue_min: number
  estimated_revenue_max: number
  market_demand_score: number
  competition_score: number
  status: 'חדש' | 'בבדיקה' | 'בפעולה' | 'נסגר'
  notes: string
  previous_revenue_score: number
  score_change: number
  heat_status: 'heating' | 'cooling' | null
  last_ai_update: string
  created_at: string
}

interface Props {
  opportunity: AIOpportunity
  onStatusChange: (id: string, status: AIOpportunity['status']) => void
  onDelete: (id: string) => void
  onNotesSave: (id: string, notes: string) => void
}

const sourceLabel: Record<string, string> = {
  weekly:          'שבועי',
  niche:           'נישה',
  market_analysis: 'ניתוח שוק',
}

const sourceColor: Record<string, string> = {
  weekly:          'bg-yellow-100 text-yellow-700 border-yellow-200',
  niche:           'bg-blue-100 text-blue-700 border-blue-200',
  market_analysis: 'bg-teal-100 text-teal-700 border-teal-200',
}

function scoreBarColor(score: number): string {
  if (score >= 75) return 'bg-orange-500'
  if (score >= 50) return 'bg-green-500'
  if (score >= 25) return 'bg-blue-500'
  return 'bg-gray-400'
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}.${mm}.${yyyy}`
}

export default function AIOpportunityCard({ opportunity: opp, onStatusChange, onDelete, onNotesSave }: Props) {
  const [notes, setNotes] = useState(opp.notes || '')
  const notesRef = useRef(notes)
  notesRef.current = notes

  function handleNotesBlur() {
    if (notesRef.current !== opp.notes) {
      onNotesSave(opp.id, notesRef.current)
    }
  }

  const scoreChange = opp.score_change || 0

  return (
    <div className="rounded-lg border bg-white p-4 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow">
      {/* Top row: source + heat badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className={`text-xs ${sourceColor[opp.source_type] || ''}`}>
          {sourceLabel[opp.source_type] || opp.source_type}
        </Badge>
        {opp.heat_status === 'heating' && (
          <Badge variant="outline" className="text-xs bg-orange-100 text-orange-700 border-orange-200">
            מתחמם 🔥
          </Badge>
        )}
        {opp.heat_status === 'cooling' && (
          <Badge variant="outline" className="text-xs bg-sky-100 text-sky-600 border-sky-200">
            מתקרר ❄️
          </Badge>
        )}
      </div>

      {/* Title */}
      <p className="font-semibold text-sm leading-tight">{opp.title}</p>

      {/* Revenue score bar */}
      <div>
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>פוטנציאל הכנסה</span>
          <div className="flex items-center gap-1.5">
            <span className="font-semibold">{opp.revenue_potential_score}</span>
            {Math.abs(scoreChange) > 0 && (
              <span className={`text-xs font-medium ${scoreChange > 0 ? 'text-green-600' : 'text-red-500'}`}>
                {scoreChange > 0 ? `+${scoreChange} ↑` : `${scoreChange} ↓`}
              </span>
            )}
          </div>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${scoreBarColor(opp.revenue_potential_score)}`}
            style={{ width: `${Math.min(100, opp.revenue_potential_score)}%` }}
          />
        </div>
      </div>

      {/* Revenue range */}
      {(opp.estimated_revenue_min > 0 || opp.estimated_revenue_max > 0) && (
        <p className="text-xs font-medium text-muted-foreground">
          ₪{opp.estimated_revenue_min.toLocaleString()} – ₪{opp.estimated_revenue_max.toLocaleString()} / חודש
        </p>
      )}

      {/* Notes */}
      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        onBlur={handleNotesBlur}
        placeholder="הערות..."
        rows={2}
        className="w-full text-xs rounded border border-border bg-muted/30 px-2 py-1.5 text-right resize-none focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/50"
        dir="rtl"
      />

      {/* Status + delete */}
      <div className="flex items-center gap-2 mt-auto">
        <Select
          value={opp.status}
          onValueChange={(v) => onStatusChange(opp.id, v as AIOpportunity['status'])}
        >
          <SelectTrigger className="flex-1 h-7 text-xs" dir="rtl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent dir="rtl">
            <SelectItem value="חדש">חדש</SelectItem>
            <SelectItem value="בבדיקה">בבדיקה</SelectItem>
            <SelectItem value="בפעולה">בפעולה</SelectItem>
            <SelectItem value="נסגר">נסגר</SelectItem>
          </SelectContent>
        </Select>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-red-500 shrink-0">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>מחק הזדמנות</AlertDialogTitle>
              <AlertDialogDescription>
                האם למחוק את ההזדמנות "{opp.title}"? פעולה זו אינה הפיכה.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>ביטול</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onDelete(opp.id)}
                className="bg-red-600 hover:bg-red-700"
              >
                מחק
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Last updated */}
      <p className="text-xs text-muted-foreground/60">עודכן: {formatDate(opp.last_ai_update)}</p>
    </div>
  )
}
