"use client"

import { useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowLeft, ExternalLink, Loader2, Bookmark, Plus } from "lucide-react"
import type { MarketAnalysis, AnalysisSignal } from "@/types/market-analysis"
import type { NicheOpportunity } from "@/types/niche-opportunity"
import { calculateRevenueMetrics } from "@/lib/revenue-engine"
import { revenueInputFromMarketAnalysis } from "@/lib/revenue-adapters"

const revenueLevelColor: Record<string, string> = {
  'נמוך':    'bg-gray-100 text-gray-600 border-gray-200',
  'בינוני':  'bg-blue-100 text-blue-700 border-blue-200',
  'גבוה':    'bg-green-100 text-green-700 border-green-200',
  'חם מאוד': 'bg-orange-100 text-orange-700 border-orange-200',
}

const momentumColor: Record<string, string> = {
  עולה: "bg-green-100 text-green-700 border-green-200",
  יציב: "bg-gray-100 text-gray-600 border-gray-200",
  רווי: "bg-yellow-100 text-yellow-700 border-yellow-200",
  בירידה: "bg-red-100 text-red-700 border-red-200",
}

const signalIcon: Record<string, string> = {
  trend:      "📈",
  competitor: "🏢",
  tender:     "📋",
  news:       "📰",
  lead:       "👤",
  conference: "🎤",
}

const signalBorder: Record<string, string> = {
  trend:      "border-blue-300",
  competitor: "border-red-300",
  tender:     "border-purple-300",
  news:       "border-slate-300",
  lead:       "border-teal-300",
  conference: "border-indigo-300",
}

interface Props {
  analysis: MarketAnalysis
  onSaved?: () => void
}

export default function MarketAnalysisPanelView({ analysis, onSaved }: Props) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [addingNiche, setAddingNiche] = useState(false)
  const [nicheAdded, setNicheAdded] = useState(false)
  const [explExpanded, setExplExpanded] = useState(false)

  const metrics = calculateRevenueMetrics(revenueInputFromMarketAnalysis(analysis))

  async function handleSave() {
    setSaving(true)
    try {
      await fetch('/api/save-market-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis }),
      })
      setSaved(true)
      onSaved?.()
    } catch {
      // silent — auto-save already happened in analyze-market
    } finally {
      setSaving(false)
    }
  }

  async function handleAddNiche() {
    setAddingNiche(true)
    try {
      const niche: NicheOpportunity = {
        id: `ma-${analysis.id}-${Date.now()}`,
        nicheTitle: analysis.query,
        shortInsightSummary: analysis.summary,
        opportunityScore: analysis.gapScore,
        confidenceScore: Math.round((analysis.demandScore + analysis.gapScore) / 2),
        signals: analysis.signals.map(s => ({
          id: s.id,
          type: s.type as any,
          title: s.title,
          source: s.source,
          date: s.date,
          relevanceScore: s.relevanceScore,
          sourceRoute: s.sourceRoute,
          externalUrl: s.externalUrl,
        })),
        demandTrend: analysis.marketMomentum === 'עולה' ? 'עולה' : analysis.marketMomentum === 'בירידה' ? 'יורד' : 'יציב',
        competitionLevel: analysis.competitionScore >= 70 ? 'גבוהה' : analysis.competitionScore >= 40 ? 'בינונית' : 'נמוכה',
        estimatedLeadPotential: analysis.leadPotential,
        estimatedMarketSize: '',
        region: analysis.region,
        category: analysis.category,
        whyThisNicheFitsYourBusiness: analysis.strategicRecommendations[0] || '',
        strategicNextSteps: analysis.strategicRecommendations,
        relatedKeywords: [analysis.query],
        relatedCompetitors: [],
        status: 'tracking',
      }

      await fetch('/api/niche-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche }),
      })
      setNicheAdded(true)
    } catch {
      // silent
    } finally {
      setAddingNiche(false)
    }
  }

  return (
    <div className="space-y-5 text-right" dir="rtl">
      {/* Summary */}
      <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4">
        <p className="text-sm font-medium text-emerald-800 leading-relaxed">{analysis.summary}</p>
      </div>

      {/* Score bars */}
      <div className="grid grid-cols-3 gap-3">
        <ScoreBar label="ביקוש" value={analysis.demandScore} color="blue" />
        <ScoreBar label="תחרות" value={analysis.competitionScore} color="red" />
        <ScoreBar label="פוטנציאל כניסה" value={analysis.gapScore} color="green" />
      </div>

      {/* Revenue Intelligence Card */}
      <div className="rounded-lg border bg-gradient-to-br from-orange-50/40 to-white p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold">פוטנציאל הכנסה 💰</p>
          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${revenueLevelColor[metrics.revenueLevel] || ''} ${metrics.revenueLevel === 'חם מאוד' ? 'animate-pulse' : ''}`}>
            {metrics.revenueLevel}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs mb-3">
          <div>
            <p className="text-muted-foreground">הכנסה חודשית משוערת</p>
            <p className="font-semibold text-sm">₪{metrics.estimatedMonthlyRevenueMin.toLocaleString()} – ₪{metrics.estimatedMonthlyRevenueMax.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-muted-foreground">גודל עסקה ממוצע</p>
            <p className="font-semibold text-sm">₪{metrics.avgDealSize.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-muted-foreground">הסתברות סגירה</p>
            <p className="font-semibold">{metrics.closeProbability}%</p>
          </div>
          <div>
            <p className="text-muted-foreground">זמן לעסקה ראשונה</p>
            <p className="font-semibold">{metrics.timeToRevenueDays.min}–{metrics.timeToRevenueDays.max} ימים</p>
          </div>
        </div>
        <div className="mb-1">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>ביטחון הניתוח</span>
            <span className="font-medium">{metrics.confidenceScore}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-orange-100 overflow-hidden">
            <div className="h-full rounded-full bg-orange-400 transition-all" style={{ width: `${metrics.confidenceScore}%` }} />
          </div>
        </div>
        {metrics.explanation.length > 0 && (
          <div className="mt-3 border-t pt-3">
            <button
              className="text-xs text-orange-600 hover:text-orange-700 font-medium"
              onClick={() => setExplExpanded(e => !e)}
            >
              {explExpanded ? 'הסתר פירוט ↑' : 'הצג פירוט ↓'}
            </button>
            {explExpanded && (
              <ul className="mt-2 space-y-1">
                {metrics.explanation.map((line, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex gap-2">
                    <span className="text-orange-400 shrink-0">·</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground/60 mt-2">הערכה מבוססת על נתוני שוק אמיתיים וסיגנלים שנאספו במערכת</p>
      </div>

      {/* Momentum + Lead potential */}
      <div className="flex flex-wrap gap-3 items-center">
        <Badge variant="outline" className={`text-sm ${momentumColor[analysis.marketMomentum] || ''}`}>
          תנועת שוק: {analysis.marketMomentum}
        </Badge>
        {analysis.leadPotential && (
          <span className="text-sm text-muted-foreground">
            פוטנציאל לידים: <span className="font-medium text-foreground">{analysis.leadPotential}</span>
          </span>
        )}
      </div>

      {/* Signals */}
      {analysis.signals.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">סיגנלים שהשפיעו על הניתוח ({analysis.signals.length})</h3>
          <div className="space-y-2">
            {analysis.signals.map((s, i) => (
              <SignalCard key={s.id || i} signal={s} />
            ))}
          </div>
        </div>
      )}

      {/* Opportunities & Risks */}
      {(analysis.opportunities.length > 0 || analysis.risks.length > 0) && (
        <div className="grid grid-cols-2 gap-4">
          {analysis.opportunities.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">הזדמנויות 🟢</h3>
              <ul className="space-y-1.5">
                {analysis.opportunities.map((o, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-green-500 mt-0.5 shrink-0">•</span>
                    <span>{o}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {analysis.risks.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">סיכונים 🔴</h3>
              <ul className="space-y-1.5">
                {analysis.risks.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-red-500 mt-0.5 shrink-0">•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Strategic recommendations */}
      {analysis.strategicRecommendations.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">כיווני פעולה מומלצים</h3>
          <ol className="space-y-2">
            {analysis.strategicRecommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700 mt-0.5">
                  {i + 1}
                </div>
                <span className="text-sm">{rec}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 pt-2 border-t">
        <Button
          className="flex-1 bg-emerald-600 hover:bg-emerald-700"
          onClick={handleSave}
          disabled={saving || saved}
        >
          {saving
            ? <Loader2 className="h-4 w-4 animate-spin ml-2" />
            : <Bookmark className="h-4 w-4 ml-2" />}
          {saved ? "נשמר ✓" : "שמור כהזדמנות"}
        </Button>
        <Button
          variant="outline"
          className="flex-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
          onClick={handleAddNiche}
          disabled={addingNiche || nicheAdded}
        >
          {addingNiche
            ? <Loader2 className="h-4 w-4 animate-spin ml-2" />
            : <Plus className="h-4 w-4 ml-2" />}
          {nicheAdded ? "נוסף ✓" : "הוסף לנישות במעקב"}
        </Button>
      </div>
    </div>
  )
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: 'blue' | 'red' | 'green' }) {
  const colors = {
    blue:  { text: 'text-blue-600',  bg: 'bg-blue-100',  fill: 'bg-blue-500' },
    red:   { text: 'text-red-600',   bg: 'bg-red-100',   fill: 'bg-red-500' },
    green: { text: 'text-green-600', bg: 'bg-green-100', fill: 'bg-green-500' },
  }
  const c = colors[color]

  return (
    <div className="rounded-lg border p-3 text-center">
      <p className="text-xs text-muted-foreground mb-2 truncate">{label}</p>
      <p className={`text-2xl font-bold ${c.text} mb-2`}>{value}</p>
      <div className={`h-1.5 rounded-full ${c.bg} overflow-hidden`}>
        <div className={`h-full rounded-full ${c.fill} transition-all`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  )
}

function SignalCard({ signal }: { signal: AnalysisSignal }) {
  const icon = signalIcon[signal.type] || "📌"
  const border = signalBorder[signal.type] || "border-gray-300"

  return (
    <div className={`rounded-lg border-r-4 border border-border bg-muted/30 p-3 ${border}`}>
      <div className="flex items-start gap-2">
        <span className="text-base shrink-0 mt-0.5">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold leading-tight">{signal.title}</p>
            <span className="text-xs text-muted-foreground shrink-0">{signal.relevanceScore}%</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{signal.source} · {signal.date}</p>
          <div className="flex flex-wrap gap-3 mt-2">
            {signal.sourceRoute && (
              <Link href={signal.sourceRoute} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
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
