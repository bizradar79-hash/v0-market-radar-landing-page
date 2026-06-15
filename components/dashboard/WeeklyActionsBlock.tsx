"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, ChevronLeft, Zap, Calendar } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import WeeklyActionDetailsPanel from "./WeeklyActionDetailsPanel"
import type { WeeklyAction, WeeklyActionsData } from "@/types/weekly-actions"
import { calculateRevenueMetrics } from "@/lib/revenue-engine"
import { revenueInputFromWeeklyAction } from "@/lib/revenue-adapters"
// Module-level cache: survives navigation remounts, cleared only on explicit refresh
let _cache: WeeklyActionsData | null = null

const revenueLevelColor: Record<string, string> = {
  'נמוך':    'bg-gray-100 text-gray-600 border-gray-200',
  'בינוני':  'bg-blue-100 text-blue-700 border-blue-200',
  'גבוה':    'bg-green-100 text-green-700 border-green-200',
  'חם מאוד': 'bg-orange-100 text-orange-700 border-orange-200',
}

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

function formatDate(fetchedAt: string): string {
  const d = new Date(fetchedAt)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `עודכן: ${dd}.${mm}.${yyyy}`
}

export default function WeeklyActionsBlock() {
  const [data, setData] = useState<WeeklyActionsData | null>(_cache)
  const [loading, setLoading] = useState(_cache === null)
  const [selectedAction, setSelectedAction] = useState<WeeklyAction | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [savedTitles, setSavedTitles] = useState<Set<string>>(new Set())

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('saved_items').select('title').eq('company_id', user.id).eq('item_type', 'action').then(({ data }) => {
        if (data) setSavedTitles(new Set(data.map((s: any) => s.title)))
      })
    })
  }, [])

  // Display-only: read the SAVED weekly_actions, never trigger AI generation.
  // Generation happens exclusively via the scan (weekly/admin), same as the report.
  const loadCached = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/generate-weekly-actions?cachedOnly=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(15000),
      })
      const json = await res.json()
      const next = { fetchedAt: json.fetchedAt, actions: Array.isArray(json.actions) ? json.actions : [] }
      _cache = next
      setData(next)
    } catch {
      // silent — fall through to empty state
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (_cache !== null) return // already loaded — skip API call
    loadCached()
  }, [loadCached])

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
          <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
            {[1, 2].map(i => (
              <div key={i} className="rounded-lg border bg-muted/30 p-5 animate-pulse">
                <div className="h-4 w-16 bg-muted rounded mb-3" />
                <div className="h-5 w-full bg-muted rounded mb-2" />
                <div className="h-3 w-3/4 bg-muted rounded" />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-2 mt-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>טוען...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!data || !data.actions || data.actions.length === 0) {
    return (
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Zap className="h-5 w-5 text-amber-500" />
            מה לעשות השבוע
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-10">
          <p className="text-sm text-muted-foreground">
            הפעולות יתעדכנו בסריקה הבאה
          </p>
        </CardContent>
      </Card>
    )
  }

  const sortedActions = [
    ...(data.actions ?? []).filter(a => a.priority === 'גבוהה'),
    ...(data.actions ?? []).filter(a => a.priority !== 'גבוהה'),
  ].slice(0, 6)

  return (
    <>
      <Card className="border-amber-200 bg-gradient-to-br from-amber-50/50 to-white">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Zap className="h-5 w-5 text-amber-500" />
              מה לעשות השבוע
            </CardTitle>
            {data.fetchedAt && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {formatDate(data.fetchedAt)}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {sortedActions.length} פעולות מומלצות · לחץ על כל כרטיס לפרטים מלאים
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
            {sortedActions.map(action => (
              <ActionCard
                key={action.id}
                action={action}
                onClick={() => openAction(action)}
                isSaved={savedTitles.has(action.title)}
                onSave={() => setSavedTitles(prev => new Set([...prev, action.title]))}
              />
            ))}
          </div>
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

function ActionCard({ action, onClick, isSaved, onSave }: { action: WeeklyAction; onClick: () => void; isSaved: boolean; onSave: () => void }) {
  const icon = categoryIcon[action.category] || "✅"
  const prioClass = priorityColor[action.priority] || ""
  const isHigh = action.priority === 'גבוהה'
  const metrics = calculateRevenueMetrics(revenueInputFromWeeklyAction(action))

  async function handleSave(e: React.MouseEvent) {
    e.stopPropagation()
    onSave()
    try {
      await fetch('/api/saved-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_type: 'action',
          item_id: action.id,
          title: action.title,
          description: (action as any).summary?.slice(0, 160) || null,
          url: null,
          source_module: 'פעולות שבועיות',
          metadata: { category: action.category, priority: action.priority },
        }),
      })
      const win = window as any
      if (typeof win.refreshSidebarCounts === 'function') win.refreshSidebarCounts()
    } catch {}
  }

  return (
    <button
      onClick={onClick}
      className={`w-full h-full text-right rounded-xl border p-5 transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer bg-white ${isHigh ? 'border-red-200 ring-1 ring-red-100' : 'border-border hover:border-primary/40'}`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <Badge variant="outline" className={`text-xs ${prioClass}`}>
            {action.priority}
          </Badge>
        </div>
        <Badge variant="outline" className="text-xs text-muted-foreground shrink-0">
          {action.category}
        </Badge>
      </div>

      <p className="text-base font-semibold leading-snug mb-2 line-clamp-2">{action.title}</p>
      <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">{(action as any).summary}</p>

      <div className="flex items-center gap-2 mt-3">
        <Badge
          variant="outline"
          className={`text-xs ${revenueLevelColor[metrics.revenueLevel] || ''} ${metrics.revenueLevel === 'חם מאוד' ? 'animate-pulse' : ''}`}
        >
          💰 {metrics.revenueLevel}
        </Badge>
        <span className="text-xs text-muted-foreground">תוך {metrics.timeToRevenueDays.min}–{metrics.timeToRevenueDays.max} יום</span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-1">
        {isSaved ? (
          <span className="flex items-center gap-1 text-xs border rounded-md px-2 py-0.5 bg-green-50 text-green-700 border-green-200 cursor-default" onClick={e => e.stopPropagation()}>✓ נשמר</span>
        ) : (
          <button className="flex items-center gap-1 text-xs border rounded-md px-2 py-0.5 hover:bg-muted" onClick={handleSave}>🔖 שמור</button>
        )}
        <div className="flex items-center gap-1 text-xs text-primary">
          <span>לפרטים</span>
          <ChevronLeft className="h-3 w-3" />
        </div>
      </div>
    </button>
  )
}
