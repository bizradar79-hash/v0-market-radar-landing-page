"use client"

import Link from "next/link"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, ExternalLink, ArrowLeft } from "lucide-react"
import type { WeeklyAction, ActionSignal } from "@/types/weekly-actions"

const priorityColor: Record<string, string> = {
  גבוהה: "bg-red-100 text-red-700 border-red-200",
  בינונית: "bg-yellow-100 text-yellow-700 border-yellow-200",
  נמוכה: "bg-gray-100 text-gray-600 border-gray-200",
}

const effortColor: Record<string, string> = {
  נמוך: "bg-green-100 text-green-700 border-green-200",
  בינוני: "bg-blue-100 text-blue-700 border-blue-200",
  גבוה: "bg-orange-100 text-orange-700 border-orange-200",
}

const categoryColor: Record<string, string> = {
  מכרז: "bg-purple-100 text-purple-700 border-purple-200",
  ליד: "bg-teal-100 text-teal-700 border-teal-200",
  מתחרה: "bg-red-100 text-red-700 border-red-200",
  טרנד: "bg-blue-100 text-blue-700 border-blue-200",
  שיווק: "bg-pink-100 text-pink-700 border-pink-200",
  כנס: "bg-indigo-100 text-indigo-700 border-indigo-200",
  כללי: "bg-gray-100 text-gray-700 border-gray-200",
}

const signalIcon: Record<ActionSignal['type'], string> = {
  trend:      "📈",
  competitor: "🏢",
  tender:     "📋",
  news:       "📰",
  lead:       "👤",
  conference: "🎤",
  keyword:    "🔍",
}

const signalBorderColor: Record<ActionSignal['type'], string> = {
  trend:      "border-blue-300",
  competitor: "border-red-300",
  tender:     "border-purple-300",
  news:       "border-slate-300",
  lead:       "border-teal-300",
  conference: "border-indigo-300",
  keyword:    "border-blue-300",
}

interface Props {
  action: WeeklyAction | null
  open: boolean
  onClose: () => void
}

export default function WeeklyActionDetailsPanel({ action, open, onClose }: Props) {
  if (!action) return null

  const hasSignals = action.signals && action.signals.length > 0

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent side="left" className="w-full sm:max-w-lg overflow-y-auto" dir="rtl">
        <SheetHeader className="mb-6">
          <div className="flex flex-wrap gap-2 mb-3">
            <Badge variant="outline" className={categoryColor[action.category] || categoryColor.כללי}>
              {action.category}
            </Badge>
            <Badge variant="outline" className={priorityColor[action.priority] || ""}>
              עדיפות {action.priority}
            </Badge>
            <Badge variant="outline" className={effortColor[action.effort] || ""}>
              מאמץ {action.effort}
            </Badge>
          </div>
          <SheetTitle className="text-xl font-bold text-right leading-tight">
            {action.title}
          </SheetTitle>
          <p className="text-sm text-muted-foreground text-right mt-2">{action.summary}</p>
        </SheetHeader>

        <div className="space-y-6 text-right">
          {/* Signals — why this week with verifiable links */}
          {hasSignals ? (
            <div>
              <p className="text-xs font-semibold text-amber-700 mb-3">למה דווקא השבוע?</p>
              <div className="space-y-2">
                {action.signals.map((signal, i) => (
                  <SignalCard key={i} signal={signal} />
                ))}
              </div>
            </div>
          ) : action.why_this_week ? (
            /* Fallback for cached data without signals */
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
              <p className="text-xs font-semibold text-amber-700 mb-1">למה דווקא השבוע?</p>
              <p className="text-sm text-amber-800">{action.why_this_week}</p>
            </div>
          ) : null}

          {/* Details */}
          {action.details && (
            <div>
              <h3 className="text-sm font-semibold mb-2">תיאור מפורט</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{action.details}</p>
            </div>
          )}

          {/* Steps */}
          {action.steps && action.steps.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3">שלבי פעולה</h3>
              <ol className="space-y-2">
                {action.steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary mt-0.5">
                      {i + 1}
                    </div>
                    <span className="text-sm">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Expected outcome */}
          {action.expected_outcome && (
            <div className="rounded-lg bg-green-50 border border-green-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                <p className="text-xs font-semibold text-green-700">תוצאה צפויה</p>
              </div>
              <p className="text-sm text-green-800">{action.expected_outcome}</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function SignalCard({ signal }: { signal: ActionSignal }) {
  const icon = signalIcon[signal.type] || "📌"
  const border = signalBorderColor[signal.type] || "border-gray-300"

  return (
    <div className={`rounded-lg border-r-4 border border-border bg-muted/30 p-3 ${border}`}>
      <div className="flex items-start gap-2">
        <span className="text-base shrink-0 mt-0.5">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">{signal.label}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{signal.description}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {signal.sourceRoute && (
              <Link
                href={signal.sourceRoute}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                צפה במערכת
                <ArrowLeft className="h-3 w-3" />
              </Link>
            )}
            {signal.externalUrl && (
              <a
                href={signal.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                מקור חיצוני
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
