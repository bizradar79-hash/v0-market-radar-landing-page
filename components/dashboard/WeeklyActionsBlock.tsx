"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Loader2, RefreshCw, ChevronLeft, Zap, Calendar } from "lucide-react"
import WeeklyActionDetailsPanel from "./WeeklyActionDetailsPanel"
import type { WeeklyAction, WeeklyActionsData } from "@/types/weekly-actions"

const priorityColor: Record<string, string> = {
  גבוהה: "bg-red-100 text-red-700 border-red-200",
  בינונית: "bg-yellow-100 text-yellow-700 border-yellow-200",
  נמוכה: "bg-gray-100 text-gray-600 border-gray-200",
}

const categoryIcon: Record<string, string> = {
  מכרז: "📋",
  ליד: "🎯",
  מתחרה: "⚔️",
  טרנד: "📈",
  שיווק: "📣",
  כנס: "🎤",
  כללי: "✅",
}

function formatAge(fetchedAt: string): string {
  const ms = Date.now() - new Date(fetchedAt).getTime()
  const h = Math.floor(ms / 3600000)
  if (h < 1) return "לפני פחות משעה"
  if (h < 24) return `לפני ${h} שעות`
  const d = Math.floor(h / 24)
  return `לפני ${d} ימים`
}

export default function WeeklyActionsBlock() {
  const [data, setData] = useState<WeeklyActionsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedAction, setSelectedAction] = useState<WeeklyAction | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)

  const fetchActions = useCallback(async (force = false) => {
    if (force) setRefreshing(true)
    else setLoading(true)
    try {
      const res = await fetch('/api/generate-weekly-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      })
      const json = await res.json()
      if (json.actions) {
        setData({ fetchedAt: json.fetchedAt, actions: json.actions })
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { fetchActions(false) }, [fetchActions])

  function openAction(action: WeeklyAction) {
    setSelectedAction(action)
    setPanelOpen(true)
  }

  // Loading skeleton
  if (loading) {
    return (
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Zap className="h-5 w-5 text-amber-500" />
            מה לעשות השבוע
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-lg border bg-muted/30 p-4 animate-pulse">
                <div className="h-4 w-16 bg-muted rounded mb-3" />
                <div className="h-4 w-full bg-muted rounded mb-2" />
                <div className="h-3 w-3/4 bg-muted rounded" />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-2 mt-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>מנתח את השוק ומכין המלצות שבועיות...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!data || data.actions.length === 0) {
    return (
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Zap className="h-5 w-5 text-amber-500" />
            מה לעשות השבוע
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-6">
          <p className="text-sm text-muted-foreground mb-4">
            לחץ לקבלת המלצות מותאמות אישית לשבוע הנוכחי
          </p>
          <Button onClick={() => fetchActions(true)} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Zap className="h-4 w-4 ml-2" />}
            צור המלצות שבועיות
          </Button>
        </CardContent>
      </Card>
    )
  }

  const highPriority = data.actions.filter(a => a.priority === 'גבוהה')
  const rest = data.actions.filter(a => a.priority !== 'גבוהה')

  return (
    <>
      <Card className="border-amber-200 bg-gradient-to-br from-amber-50/50 to-white">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Zap className="h-5 w-5 text-amber-500" />
              מה לעשות השבוע
            </CardTitle>
            <div className="flex items-center gap-3">
              {data.fetchedAt && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {formatAge(data.fetchedAt)}
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fetchActions(true)}
                disabled={refreshing}
                className="h-7 px-2"
              >
                {refreshing
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <RefreshCw className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {data.actions.length} פעולות מומלצות · לחץ על כל כרטיס לפרטים מלאים
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* High priority row */}
          {highPriority.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {highPriority.map(action => (
                <ActionCard key={action.id} action={action} onClick={() => openAction(action)} />
              ))}
            </div>
          )}

          {/* Rest */}
          {rest.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map(action => (
                <ActionCard key={action.id} action={action} onClick={() => openAction(action)} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <WeeklyActionDetailsPanel
        action={selectedAction}
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
      />
    </>
  )
}

function ActionCard({ action, onClick }: { action: WeeklyAction; onClick: () => void }) {
  const icon = categoryIcon[action.category] || "✅"
  const prioClass = priorityColor[action.priority] || ""
  const isHigh = action.priority === 'גבוהה'

  return (
    <button
      onClick={onClick}
      className={`w-full text-right rounded-lg border p-4 transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer bg-white ${isHigh ? 'border-red-200 ring-1 ring-red-100' : 'border-border hover:border-primary/40'}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-base">{icon}</span>
          <Badge variant="outline" className={`text-xs ${prioClass}`}>
            {action.priority}
          </Badge>
        </div>
        <Badge variant="outline" className="text-xs text-muted-foreground shrink-0">
          {action.category}
        </Badge>
      </div>

      <p className="text-sm font-semibold leading-tight mb-1.5 line-clamp-2">{action.title}</p>
      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{action.summary}</p>

      <div className="mt-3 flex items-center justify-end gap-1 text-xs text-primary">
        <span>לפרטים</span>
        <ChevronLeft className="h-3 w-3" />
      </div>
    </button>
  )
}
