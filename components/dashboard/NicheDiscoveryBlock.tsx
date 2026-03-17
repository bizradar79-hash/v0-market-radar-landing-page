"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Loader2, RefreshCw, Search, Calendar, Bookmark, BookmarkCheck, Eye } from "lucide-react"
import NicheDetailsPanel from "./NicheDetailsPanel"
import type { NicheOpportunity, NicheOpportunityData, NicheStatus } from "@/types/niche-opportunity"
import { calculateRevenueMetrics } from "@/lib/revenue-engine"
import { revenueInputFromNiche } from "@/lib/revenue-adapters"

// Module-level cache: survives navigation remounts, cleared only on explicit refresh
let _cache: NicheOpportunityData | null = null

const revenueLevelColor: Record<string, string> = {
  'נמוך':    'bg-gray-100 text-gray-600 border-gray-200',
  'בינוני':  'bg-blue-100 text-blue-700 border-blue-200',
  'גבוה':    'bg-green-100 text-green-700 border-green-200',
  'חם מאוד': 'bg-orange-100 text-orange-700 border-orange-200',
}

const demandColor: Record<string, string> = {
  עולה: "bg-green-100 text-green-700 border-green-200",
  יציב: "bg-gray-100 text-gray-600 border-gray-200",
  יורד: "bg-red-100 text-red-700 border-red-200",
}

const competitionColor: Record<string, string> = {
  נמוכה: "bg-green-100 text-green-700 border-green-200",
  בינונית: "bg-yellow-100 text-yellow-700 border-yellow-200",
  גבוהה: "bg-red-100 text-red-700 border-red-200",
}

function formatDate(fetchedAt: string): string {
  const d = new Date(fetchedAt)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `עודכן: ${dd}.${mm}.${yyyy}`
}

export default function NicheDiscoveryBlock() {
  const [data, setData] = useState<NicheOpportunityData | null>(_cache)
  const [loading, setLoading] = useState(_cache === null)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedNiche, setSelectedNiche] = useState<NicheOpportunity | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [statusOverrides, setStatusOverrides] = useState<Record<string, NicheStatus>>({})

  const fetchOpportunities = useCallback(async (force = false) => {
    if (force) {
      _cache = null
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    try {
      const url = force ? '/api/generate-niche-opportunities?force=true' : '/api/generate-niche-opportunities'
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const json = await res.json()
      if (json.opportunities) {
        const next = { fetchedAt: json.fetchedAt, opportunities: json.opportunities }
        _cache = next
        setData(next)
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    if (_cache !== null) return // already loaded — skip API call
    fetchOpportunities(false)
  }, [fetchOpportunities])

  function getEffectiveStatus(niche: NicheOpportunity): NicheStatus {
    return statusOverrides[niche.id] ?? niche.status
  }

  async function handleStatusChange(nicheId: string, newStatus: NicheStatus) {
    const current = data?.opportunities.find(n => n.id === nicheId)
    const prev = statusOverrides[nicheId] ?? current?.status ?? 'new'
    // Apply optimistic update immediately
    setStatusOverrides(o => ({ ...o, [nicheId]: newStatus }))
    try {
      const res = await fetch('/api/niche-status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nicheId, status: newStatus }),
      })
      // Only revert on server-side errors (5xx) — 200/no-op/4xx keep the optimistic state
      if (res.status >= 500) {
        console.warn(`[niche-status] server error ${res.status}, reverting`)
        setStatusOverrides(o => ({ ...o, [nicheId]: prev }))
      }
    } catch {
      // Network failure — keep optimistic state so UX stays responsive
      console.warn('[niche-status] network error — keeping optimistic state')
    }
  }

  const visibleNiches = (data?.opportunities || []).filter(
    n => getEffectiveStatus(n) !== 'ignored'
  )

  // Loading skeleton
  if (loading) {
    return (
      <Card className="border-blue-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Search className="h-5 w-5 text-blue-500" />
            מצא נישה חדשה
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-lg border bg-muted/30 p-4 animate-pulse">
                <div className="h-3 w-20 bg-muted rounded mb-3" />
                <div className="h-4 w-full bg-muted rounded mb-2" />
                <div className="h-3 w-3/4 bg-muted rounded mb-3" />
                <div className="h-2 w-full bg-muted rounded" />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-2 mt-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>מזהה הזדמנויות נישה מנתוני השוק...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Empty state
  if (!data || visibleNiches.length === 0) {
    return (
      <Card className="border-blue-200">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Search className="h-5 w-5 text-blue-500" />
              מצא נישה חדשה
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => fetchOpportunities(true)} disabled={refreshing} className="h-7 px-2">
              {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="text-center py-6">
          <p className="text-sm text-muted-foreground mb-4">
            לא זוהו נישות חדשות כרגע. לחץ רענן לנסות שוב.
          </p>
          <Button variant="outline" onClick={() => fetchOpportunities(true)} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <RefreshCw className="h-4 w-4 ml-2" />}
            רענן
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className="border-blue-200 bg-gradient-to-br from-blue-50/40 to-white">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Search className="h-5 w-5 text-blue-500" />
              מצא נישה חדשה
            </CardTitle>
            <div className="flex items-center gap-3">
              {data.fetchedAt && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {formatDate(data.fetchedAt)}
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fetchOpportunities(true)}
                disabled={refreshing}
                className="h-7 px-2"
              >
                {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            הזדמנויות צמיחה שזוהו על בסיס נתוני שוק אמיתיים · {visibleNiches.length} נישות
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleNiches.map(niche => (
              <NicheOpportunityCard
                key={niche.id}
                niche={niche}
                status={getEffectiveStatus(niche)}
                onAnalyze={() => { setSelectedNiche(niche); setPanelOpen(true) }}
                onStatusChange={(s) => handleStatusChange(niche.id, s)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <NicheDetailsPanel
        niche={selectedNiche}
        open={panelOpen}
        status={selectedNiche ? getEffectiveStatus(selectedNiche) : 'new'}
        onClose={() => setPanelOpen(false)}
        onStatusChange={handleStatusChange}
      />
    </>
  )
}

interface CardProps {
  niche: NicheOpportunity
  status: NicheStatus
  onAnalyze: () => void
  onStatusChange: (status: NicheStatus) => void
}

function NicheOpportunityCard({ niche, status, onAnalyze, onStatusChange }: CardProps) {
  const isTracking = status === 'tracking'
  const demandArrow = niche.demandTrend === 'עולה' ? '↑' : niche.demandTrend === 'יורד' ? '↓' : '→'
  const metrics = calculateRevenueMetrics(revenueInputFromNiche(niche))

  return (
    <div className={`relative rounded-lg border bg-white p-4 flex flex-col gap-3 transition-all hover:shadow-md hover:scale-[1.01] cursor-pointer ${isTracking ? 'border-blue-300 ring-1 ring-blue-100' : 'border-border hover:border-blue-300'}`}>
      {isTracking && (
        <div className="absolute top-2 left-2">
          <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-200 text-xs">במעקב ✓</Badge>
        </div>
      )}

      {/* Category + Region */}
      <div className="flex flex-wrap gap-1.5 pt-1">
        <Badge variant="outline" className="text-xs bg-indigo-50 text-indigo-700 border-indigo-200">
          {niche.category}
        </Badge>
        {niche.region && (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            {niche.region}
          </Badge>
        )}
      </div>

      {/* Title + summary */}
      <div>
        <p className="font-bold text-sm leading-tight mb-1">{niche.nicheTitle}</p>
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{niche.shortInsightSummary}</p>
      </div>

      {/* Demand + Competition + Signals count */}
      <div className="flex gap-1.5 flex-wrap">
        <Badge variant="outline" className={`text-xs ${demandColor[niche.demandTrend] || ''}`}>
          {demandArrow} {niche.demandTrend}
        </Badge>
        <Badge variant="outline" className={`text-xs ${competitionColor[niche.competitionLevel] || ''}`}>
          תחרות {niche.competitionLevel}
        </Badge>
        <Badge variant="outline" className="text-xs text-blue-600 border-blue-200 bg-blue-50">
          {niche.signals?.length || 0} סיגנלים
        </Badge>
      </div>

      {/* Opportunity score bar */}
      <div>
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>ציון הזדמנות</span>
          <span className="font-semibold text-blue-600">{niche.opportunityScore}</span>
        </div>
        <div className="h-1.5 rounded-full bg-blue-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-500 transition-all"
            style={{ width: `${Math.min(100, niche.opportunityScore)}%` }}
          />
        </div>
      </div>

      {/* Revenue level + confidence */}
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className={`text-xs ${revenueLevelColor[metrics.revenueLevel] || ''} ${metrics.revenueLevel === 'חם מאוד' ? 'animate-pulse' : ''}`}
        >
          💰 {metrics.revenueLevel}
        </Badge>
        <span className="text-xs text-muted-foreground">ביטחון: {metrics.confidenceScore}%</span>
      </div>

      {/* Lead potential */}
      {niche.estimatedLeadPotential && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">פוטנציאל: </span>
          {niche.estimatedLeadPotential}
        </p>
      )}

      {/* CTAs */}
      <div className="flex gap-2 mt-auto pt-1">
        <Button
          size="sm"
          className="flex-1 h-7 text-xs bg-blue-600 hover:bg-blue-700"
          onClick={onAnalyze}
        >
          <Eye className="h-3 w-3 ml-1" />
          נתח שוק
        </Button>
        <Button
          size="sm"
          variant="outline"
          className={`h-7 text-xs ${isTracking ? 'border-blue-300 text-blue-600 hover:bg-blue-50' : ''}`}
          onClick={() => onStatusChange(isTracking ? 'new' : 'tracking')}
        >
          {isTracking ? (
            <><BookmarkCheck className="h-3 w-3 ml-1" />הסר</>
          ) : (
            <><Bookmark className="h-3 w-3 ml-1" />מעקב</>
          )}
        </Button>
      </div>
    </div>
  )
}
