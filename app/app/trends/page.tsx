"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import {
  TrendingUp, TrendingDown, Minus, Loader2, Sparkles,
  Plus, Hash, ChevronDown, X, RefreshCw, AlertTriangle,
  Zap, BarChart2, MessageSquare, Lightbulb, AlertCircle,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

// ─── Existing keyword trend types ───────────────────────────────────────────
interface Trend {
  id: string
  company_id: string
  name: string
  category: string
  direction: string
  description: string
  created_at: string
}

interface KwTrend {
  phrase: string
  trend: string
  reason: string
  trend_data: { week: string; value: number }[]
}

interface KwData {
  fetchedAt: string
  trends?: KwTrend[]
  israel?: KwTrend[]
  world?: KwTrend[]
}

interface KwTrendsMap {
  [keyword: string]: KwData
}

// ─── New deep-analysis types ─────────────────────────────────────────────────
interface EmergingTrend {
  trend_name: string
  evidence: string
  source_type: string
  why_happening: string
  confidence_score: number
  hallucination_risk?: boolean
}

interface KeywordEntry {
  keyword: string
  search_volume: string | number
  competition_level: 'low' | 'medium' | 'high'
  trend_direction: 'rising' | 'stable' | 'declining'
  evidence: string
}

interface UnmetNeed {
  pain_point: string
  customer_quote: string
  frequency: string
  opportunity_size: 'low' | 'medium' | 'high'
}

interface StrategicAction {
  action: string
  reasoning: string
  evidence: string
  priority: 'immediate' | 'short_term' | 'long_term'
  confidence_score: number
}

interface ManualKeywordAnalysis {
  keyword: string
  trend_assessment: string
  competition_context: string
  evidence: string
  confidence_score: number
  hallucination_risk?: boolean
}

interface TrendsAnalysis {
  emerging_trends: EmergingTrend[]
  keyword_map: { quick_wins: KeywordEntry[]; high_volume: KeywordEntry[] }
  unmet_needs: UnmetNeed[]
  strategic_actions: StrategicAction[]
  manual_keyword_analysis: ManualKeywordAnalysis[]
  data_quality_warning: string | null
  fetchedAt: string
  validation?: {
    valid: boolean
    hallucination_flags: { field: string; value: string; reason: string }[]
    confidence_reduction: number
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getMomentumBadge(direction: string) {
  if (direction === 'עולה' || direction === 'up') {
    return <Badge className="bg-green-100 text-green-700 shrink-0"><TrendingUp className="ml-1 h-3 w-3" />עולה</Badge>
  }
  if (direction === 'יורד' || direction === 'down') {
    return <Badge className="bg-red-100 text-red-700 shrink-0"><TrendingDown className="ml-1 h-3 w-3" />יורד</Badge>
  }
  return <Badge className="bg-yellow-100 text-yellow-700 shrink-0"><Minus className="ml-1 h-3 w-3" />יציב</Badge>
}

function Sparkline({ data, trend }: { data: { week: string; value: number }[]; trend: string }) {
  if (!data || data.length < 2) return null
  const W = 80, H = 28
  const values = data.map(d => d.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W
    const y = H - 4 - ((v - min) / range) * (H - 8)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const lastX = W
  const lastY = H - 4 - ((values[values.length - 1] - min) / range) * (H - 8)
  const color = trend === 'עולה' ? '#16a34a' : trend === 'יורד' ? '#dc2626' : '#9ca3af'
  return (
    <svg width={W} height={H} className="shrink-0">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX.toFixed(1)} cy={lastY.toFixed(1)} r="2.5" fill={color} />
    </svg>
  )
}

function ConfidenceBar({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-green-500' : score >= 40 ? 'bg-yellow-500' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2 mt-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs text-muted-foreground shrink-0">{score}%</span>
    </div>
  )
}

function competitionLabel(level: string) {
  if (level === 'low') return { label: 'נמוכה', cls: 'text-green-600 bg-green-50 border-green-200' }
  if (level === 'high') return { label: 'גבוהה', cls: 'text-red-600 bg-red-50 border-red-200' }
  return { label: 'בינונית', cls: 'text-yellow-600 bg-yellow-50 border-yellow-200' }
}

function priorityConfig(p: string) {
  if (p === 'immediate') return { label: 'מיידי', cls: 'border-red-200 bg-red-50', dot: 'bg-red-500' }
  if (p === 'short_term') return { label: 'טווח קצר', cls: 'border-yellow-200 bg-yellow-50', dot: 'bg-yellow-500' }
  return { label: 'טווח ארוך', cls: 'border-blue-200 bg-blue-50', dot: 'bg-blue-500' }
}

function opportunityBadge(size: string) {
  if (size === 'high') return <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">הזדמנות גדולה</Badge>
  if (size === 'low') return <Badge variant="outline" className="text-muted-foreground text-xs">הזדמנות קטנה</Badge>
  return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 text-xs">הזדמנות בינונית</Badge>
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function TrendsPage() {
  const [trends, setTrends] = useState<Trend[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  // Deep analysis
  const [trendsAnalysis, setTrendsAnalysis] = useState<TrendsAnalysis | null>(null)
  const [analyzingDeep, setAnalyzingDeep] = useState(false)

  // Keyword trends state
  const [keywords, setKeywords] = useState<string[]>([])
  const [kwTrends, setKwTrends] = useState<KwTrendsMap>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loadingKw, setLoadingKw] = useState<Record<string, boolean>>({})
  const [showAddKw, setShowAddKw] = useState(false)
  const [newKw, setNewKw] = useState('')
  const [addingKw, setAddingKw] = useState(false)
  const [activeTab, setActiveTab] = useState<Record<string, 'israel' | 'world'>>({})
  const [infoExpanded, setInfoExpanded] = useState(false)

  const supabase = createClient()
  const { toast } = useToast()

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    await Promise.all([fetchTrends(), fetchKeywordData(), fetchDeepAnalysis()])
    setLoading(false)
  }

  async function fetchTrends() {
    const { data, error } = await supabase
      .from("trends").select("*").order("created_at", { ascending: false })
    if (!error && data) setTrends(data)
  }

  async function fetchKeywordData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('companies').select('keywords, keyword_trends').eq('id', user.id).single()
    if (data?.keywords) setKeywords(data.keywords)
    if (data?.keyword_trends && Object.keys(data.keyword_trends).length > 0) {
      setKwTrends(data.keyword_trends as KwTrendsMap)
    }
  }

  async function fetchDeepAnalysis() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('companies').select('trends_analysis').eq('id', user.id).single()
    if (data?.trends_analysis?.fetchedAt) {
      setTrendsAnalysis(data.trends_analysis as TrendsAnalysis)
    }
  }

  async function generateTrends() {
    setGenerating(true)
    try {
      const res = await fetch("/api/generate-trends?force=true", { method: "POST" })
      const data = await res.json()
      if (data.success) {
        await fetchTrends()
        toast({ title: "טרנדים נוספו!", description: `נמצאו ${data.count || 0} טרנדים חדשים` })
      } else {
        toast({ title: "שגיאה", description: data.error || "לא הצלחנו ליצור טרנדים", variant: "destructive" })
      }
    } catch {
      toast({ title: "שגיאה", variant: "destructive" })
    } finally {
      setGenerating(false)
    }
  }

  async function runDeepAnalysis() {
    setAnalyzingDeep(true)
    try {
      const res = await fetch('/api/analyze-trends?force=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manual_keywords: keywords.length > 0 ? keywords : undefined }),
      })
      const data = await res.json()
      if (data.success) {
        setTrendsAnalysis(data as TrendsAnalysis)
        toast({ title: "ניתוח עומק הושלם" })
      } else {
        toast({ title: "שגיאה בניתוח", description: data.error, variant: "destructive" })
      }
    } catch {
      toast({ title: "שגיאה", variant: "destructive" })
    } finally {
      setAnalyzingDeep(false)
    }
  }

  async function refreshKeywordTrend(kw: string) {
    setLoadingKw(prev => ({ ...prev, [kw]: true }))
    try {
      const res = await fetch('/api/generate-keyword-trends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: kw, force: true }),
      })
      const data = await res.json()
      if (data.success) {
        setKwTrends(prev => ({ ...prev, [kw]: {
          fetchedAt: new Date().toISOString(),
          trends: data.trends,
          israel: data.israel,
          world: data.world,
        } }))
        setExpanded(prev => new Set([...prev, kw]))
        toast({ title: `טרנדים עודכנו: ${kw}` })
      } else {
        toast({ title: 'שגיאה', description: data.error, variant: 'destructive' })
      }
    } catch {
      toast({ title: 'שגיאה', variant: 'destructive' })
    } finally {
      setLoadingKw(prev => ({ ...prev, [kw]: false }))
    }
  }

  async function addKeyword() {
    const kw = newKw.trim()
    if (!kw || keywords.includes(kw) || keywords.length >= 10) return
    setAddingKw(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setAddingKw(false); return }
    const newList = [...keywords, kw]
    const { error } = await supabase.from('companies').update({ keywords: newList }).eq('id', user.id)
    if (!error) {
      setKeywords(newList)
      setNewKw('')
      setShowAddKw(false)
      refreshKeywordTrend(kw)
    } else {
      toast({ title: 'שגיאה בשמירה', variant: 'destructive' })
    }
    setAddingKw(false)
  }

  async function removeKeyword(kw: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const newList = keywords.filter(k => k !== kw)
    const newTrends = { ...kwTrends }
    delete newTrends[kw]
    await supabase.from('companies')
      .update({ keywords: newList, keyword_trends: newTrends })
      .eq('id', user.id)
    setKeywords(newList)
    setKwTrends(newTrends)
    setExpanded(prev => { const n = new Set(prev); n.delete(kw); return n })
  }

  function toggleExpanded(kw: string) {
    setExpanded(prev => {
      const n = new Set(prev)
      if (n.has(kw)) n.delete(kw); else n.add(kw)
      return n
    })
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const sourceGroups = trends.reduce((acc, t) => {
    const src = t.category || 'אחר'
    if (!acc[src]) acc[src] = []
    acc[src].push(t)
    return acc
  }, {} as Record<string, Trend[]>)

  const priorityGroups = trendsAnalysis
    ? {
        immediate: trendsAnalysis.strategic_actions.filter(a => a.priority === 'immediate'),
        short_term: trendsAnalysis.strategic_actions.filter(a => a.priority === 'short_term'),
        long_term: trendsAnalysis.strategic_actions.filter(a => a.priority === 'long_term'),
      }
    : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">טרנדים</h1>
          <p className="text-muted-foreground">מעקב אחר מגמות שוק ותחומים מתפתחים</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={generateTrends} disabled={generating}>
            {generating
              ? <><Loader2 className="ml-2 h-4 w-4 animate-spin" />מנתח...</>
              : <><RefreshCw className="ml-2 h-4 w-4" />טרנדים מהירים</>
            }
          </Button>
          <Button onClick={runDeepAnalysis} disabled={analyzingDeep}>
            {analyzingDeep
              ? <><Loader2 className="ml-2 h-4 w-4 animate-spin" />מנתח עמוק...</>
              : <><Sparkles className="ml-2 h-4 w-4" />ניתוח עמוק עם AI</>
            }
          </Button>
        </div>
      </div>

      {/* ─── Deep Analysis Section ───────────────────────────────────────── */}
      {trendsAnalysis && (
        <div className="space-y-5">
          {/* Data quality warning */}
          {trendsAnalysis.data_quality_warning && (
            <div className="flex items-start gap-3 rounded-lg border border-orange-200 bg-orange-50 p-4">
              <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-orange-800">אזהרת איכות נתונים</p>
                <p className="text-sm text-orange-700 mt-0.5">{trendsAnalysis.data_quality_warning}</p>
              </div>
            </div>
          )}

          {/* Validation flags summary */}
          {trendsAnalysis.validation && !trendsAnalysis.validation.valid && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                {trendsAnalysis.validation.hallucination_flags.length} תובנות סומנו כבעלות סיכון הזיה —
                הצג תגיות כתומות על כל תובנה בסיכון.
                אמינות הופחתה ב-{trendsAnalysis.validation.confidence_reduction}%.
              </p>
            </div>
          )}

          {/* Emerging Trends */}
          {trendsAnalysis.emerging_trends.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold flex items-center gap-2 border-b pb-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                טרנדים מתפתחים
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {trendsAnalysis.emerging_trends.map((t, i) => (
                  <Card key={i} className="transition-shadow hover:shadow-md">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-sm leading-snug">{t.trend_name}</h3>
                        <div className="flex gap-1 shrink-0">
                          {t.hallucination_risk && (
                            <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-[10px] py-0">⚠ סיכון הזיה</Badge>
                          )}
                          <Badge variant="outline" className="text-[10px] py-0 text-muted-foreground">
                            {t.source_type}
                          </Badge>
                        </div>
                      </div>
                      <blockquote className="border-r-2 border-primary/30 pr-3 text-xs text-muted-foreground italic">
                        {t.evidence}
                      </blockquote>
                      <p className="text-xs text-foreground/80">{t.why_happening}</p>
                      <ConfidenceBar score={t.confidence_score} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Keyword Map */}
          {(trendsAnalysis.keyword_map.quick_wins.length > 0 || trendsAnalysis.keyword_map.high_volume.length > 0) && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold flex items-center gap-2 border-b pb-2">
                <BarChart2 className="h-5 w-5 text-primary" />
                מפת מילות מפתח
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                {/* Quick Wins */}
                <div className="rounded-lg border border-green-200 bg-green-50/30 p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-green-700 flex items-center gap-1.5">
                    <Zap className="h-4 w-4" />
                    Quick Wins — ניצחונות מהירים
                  </h3>
                  {trendsAnalysis.keyword_map.quick_wins.length === 0
                    ? <p className="text-xs text-muted-foreground">אין נתונים</p>
                    : trendsAnalysis.keyword_map.quick_wins.map((kw, i) => {
                        const comp = competitionLabel(kw.competition_level)
                        return (
                          <div key={i} className="rounded-md bg-white border border-green-100 p-3 space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-sm">{kw.keyword}</span>
                              <Badge variant="outline" className={`text-[10px] py-0 border ${comp.cls}`}>{comp.label}</Badge>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>נפח: {kw.search_volume}</span>
                              <span>·</span>
                              <span className={kw.trend_direction === 'rising' ? 'text-green-600' : kw.trend_direction === 'declining' ? 'text-red-500' : 'text-muted-foreground'}>
                                {kw.trend_direction === 'rising' ? '↑ עולה' : kw.trend_direction === 'declining' ? '↓ יורד' : '→ יציב'}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground italic">{kw.evidence}</p>
                          </div>
                        )
                      })
                  }
                </div>

                {/* High Volume */}
                <div className="rounded-lg border border-blue-200 bg-blue-50/30 p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-blue-700 flex items-center gap-1.5">
                    <BarChart2 className="h-4 w-4" />
                    High Volume — נפח גבוה
                  </h3>
                  {trendsAnalysis.keyword_map.high_volume.length === 0
                    ? <p className="text-xs text-muted-foreground">אין נתונים</p>
                    : trendsAnalysis.keyword_map.high_volume.map((kw, i) => {
                        const comp = competitionLabel(kw.competition_level)
                        return (
                          <div key={i} className="rounded-md bg-white border border-blue-100 p-3 space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-sm">{kw.keyword}</span>
                              <Badge variant="outline" className={`text-[10px] py-0 border ${comp.cls}`}>{comp.label}</Badge>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>נפח: {kw.search_volume}</span>
                              <span>·</span>
                              <span className={kw.trend_direction === 'rising' ? 'text-green-600' : kw.trend_direction === 'declining' ? 'text-red-500' : 'text-muted-foreground'}>
                                {kw.trend_direction === 'rising' ? '↑ עולה' : kw.trend_direction === 'declining' ? '↓ יורד' : '→ יציב'}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground italic">{kw.evidence}</p>
                          </div>
                        )
                      })
                  }
                </div>
              </div>
            </div>
          )}

          {/* Unmet Needs */}
          {trendsAnalysis.unmet_needs.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold flex items-center gap-2 border-b pb-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                צרכים לא מסופקים
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {trendsAnalysis.unmet_needs.map((n, i) => (
                  <Card key={i}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-sm">{n.pain_point}</h3>
                        {opportunityBadge(n.opportunity_size)}
                      </div>
                      <blockquote className="border-r-4 border-muted pr-3 text-sm text-muted-foreground italic leading-relaxed">
                        "{n.customer_quote}"
                      </blockquote>
                      <p className="text-xs text-muted-foreground">תדירות: {n.frequency}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Strategic Actions */}
          {trendsAnalysis.strategic_actions.length > 0 && priorityGroups && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold flex items-center gap-2 border-b pb-2">
                <Lightbulb className="h-5 w-5 text-primary" />
                פעולות אסטרטגיות
              </h2>
              <div className="space-y-4">
                {(['immediate', 'short_term', 'long_term'] as const).map(p => {
                  const actions = priorityGroups[p]
                  if (actions.length === 0) return null
                  const cfg = priorityConfig(p)
                  return (
                    <div key={p} className={`rounded-lg border p-4 space-y-3 ${cfg.cls}`}>
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <span className={`inline-block h-2 w-2 rounded-full ${cfg.dot}`} />
                        {cfg.label}
                      </h3>
                      {actions.map((a, i) => (
                        <div key={i} className="rounded-md bg-white/70 border border-white p-3 space-y-1.5">
                          <p className="text-sm font-medium">{a.action}</p>
                          <p className="text-xs text-muted-foreground">{a.reasoning}</p>
                          <blockquote className="border-r-2 border-muted/50 pr-2 text-xs text-muted-foreground italic">{a.evidence}</blockquote>
                          <ConfidenceBar score={a.confidence_score} />
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Manual Keyword Analysis */}
          {trendsAnalysis.manual_keyword_analysis.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold flex items-center gap-2 border-b pb-2">
                <Hash className="h-5 w-5 text-primary" />
                ניתוח ביטויים ידניים
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {trendsAnalysis.manual_keyword_analysis.map((mk, i) => (
                  <Card key={i}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm">#{mk.keyword}</span>
                        <div className="flex gap-1">
                          {mk.hallucination_risk && (
                            <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-[10px] py-0">⚠ סיכון הזיה</Badge>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-foreground/80">{mk.trend_assessment}</p>
                      <p className="text-xs text-muted-foreground">{mk.competition_context}</p>
                      <blockquote className="border-r-2 border-primary/30 pr-2 text-xs text-muted-foreground italic">{mk.evidence}</blockquote>
                      <ConfidenceBar score={mk.confidence_score} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            ניתוח עומק עודכן: {new Date(trendsAnalysis.fetchedAt).toLocaleDateString('he-IL')}
          </p>
        </div>
      )}

      {/* ─── Keyword Trends Section ───────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b pb-2">
          <div>
            <h2 className="text-lg font-semibold text-foreground">טרנדים לפי מילות מפתח</h2>
            <p className="text-sm text-muted-foreground">מה טרנדי השבוע עבור כל מילת מפתח ({keywords.length}/10)</p>
          </div>
          {keywords.length < 10 && !showAddKw && (
            <Button variant="outline" size="sm" onClick={() => setShowAddKw(true)}>
              <Plus className="ml-2 h-3.5 w-3.5" />הוסף מילת מפתח
            </Button>
          )}
        </div>

        {/* Data source info box */}
        <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-sm">
          {!infoExpanded ? (
            <button onClick={() => setInfoExpanded(true)} className="text-blue-700 font-medium">
              📡 מאיפה מגיעים הנתונים? ▼
            </button>
          ) : (
            <div className="space-y-1 text-blue-800 leading-relaxed">
              <p>הטרנדים מחושבים על ידי AI שסורק בזמן אמת חיפושים, פורומים, רשתות חברתיות</p>
              <p>וחדשות בישראל — ומזהה אילו ביטויים נמצאים בעלייה, ירידה או יציבים השבוע.</p>
              <p>ניתוח העומק משתמש בנתוני מילות המפתח, ביקורות, ומתחרים שנשמרו במערכת.</p>
              <button onClick={() => setInfoExpanded(false)} className="text-blue-700 font-medium mt-1 block">
                הצג פחות ▲
              </button>
            </div>
          )}
        </div>

        {/* Add keyword input */}
        {showAddKw && (
          <div className="flex gap-2">
            <Input
              value={newKw}
              onChange={e => setNewKw(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addKeyword()}
              placeholder="הקלד מילת מפתח..."
              className="max-w-xs"
              autoFocus
            />
            <Button onClick={addKeyword} disabled={addingKw || !newKw.trim()}>
              {addingKw ? <Loader2 className="h-4 w-4 animate-spin" /> : 'הוסף'}
            </Button>
            <Button variant="outline" onClick={() => { setShowAddKw(false); setNewKw('') }}>ביטול</Button>
          </div>
        )}

        {keywords.length === 0 && !showAddKw && (
          <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed py-10 text-center">
            <Hash className="h-10 w-10 text-muted-foreground/40" />
            <div>
              <p className="font-medium text-foreground">עדיין לא הוגדרו מילות מפתח</p>
              <p className="text-sm text-muted-foreground mt-1">הוסף מילת מפתח — AI יחפש מה טרנדי עכשיו ויכלול אותה בניתוח העומק</p>
            </div>
            <Button onClick={() => setShowAddKw(true)}>
              <Plus className="ml-2 h-4 w-4" />הוסף מילת מפתח
            </Button>
          </div>
        )}

        {/* Per-keyword expandable cards */}
        {keywords.map(kw => {
          const kwData = kwTrends[kw]
          const isExpanded = expanded.has(kw)
          const isLoading = !!loadingKw[kw]
          const israelTrends = kwData?.israel || kwData?.trends || []
          const worldTrends = kwData?.world || []
          const hasWorld = worldTrends.length > 0
          const tab = activeTab[kw] || 'israel'
          const displayTrends = tab === 'world' ? worldTrends : israelTrends

          return (
            <Card key={kw}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <button onClick={() => toggleExpanded(kw)} className="flex items-center gap-2 text-right">
                    <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium">{kw}</span>
                    {kwData && <span className="text-xs text-muted-foreground">{israelTrends.length} טרנדים</span>}
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refreshKeywordTrend(kw)} disabled={isLoading} title="רענן טרנדים">
                      {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeKeyword(kw)} title="הסר מילת מפתח">
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {isLoading && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>מחפש טרנדים בישראל ובעולם...</span>
                  </div>
                )}

                {isExpanded && !isLoading && kwData && (
                  <div className="mt-3">
                    {hasWorld && (
                      <div className="flex border-b mb-3">
                        {(['israel', 'world'] as const).map(t => (
                          <button
                            key={t}
                            onClick={() => setActiveTab(prev => ({ ...prev, [kw]: t }))}
                            className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                          >
                            {t === 'israel' ? '🇮🇱 ישראל' : '🌍 עולם'}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="space-y-2">
                      {displayTrends.map((t, i) => (
                        <div key={i} className="flex items-start gap-3 rounded-lg border p-3">
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{t.phrase}</span>
                              {getMomentumBadge(t.trend)}
                            </div>
                            <p className="text-xs text-muted-foreground">{t.reason}</p>
                          </div>
                          {t.trend_data?.length >= 2 && <Sparkline data={t.trend_data} trend={t.trend} />}
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground pt-2">
                      עודכן: {new Date(kwData.fetchedAt).toLocaleDateString('he-IL')}
                    </p>
                  </div>
                )}

                {isExpanded && !isLoading && !kwData && (
                  <div className="mt-3 text-center py-4 text-sm text-muted-foreground">
                    <p>לחץ רענן כדי לטעון טרנדים עבור &quot;{kw}&quot;</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* ─── General Trends Section ───────────────────────────────────────── */}
      {Object.keys(sourceGroups).map((source) => (
        <div key={source} className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground border-b pb-2">{source}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {sourceGroups[source].map((trend) => (
              <Card key={trend.id} className="transition-shadow hover:shadow-md">
                <CardContent className="p-5">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <h3 className="text-base font-semibold text-foreground leading-snug">{trend.name}</h3>
                    {getMomentumBadge(trend.direction)}
                  </div>
                  <p className="text-sm text-muted-foreground">{trend.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}

      {trends.length === 0 && !trendsAnalysis && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <TrendingUp className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">לא נמצאו טרנדים</p>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" onClick={generateTrends} disabled={generating}>
                <RefreshCw className="ml-2 h-4 w-4" />טרנדים מהירים
              </Button>
              <Button onClick={runDeepAnalysis} disabled={analyzingDeep}>
                <Sparkles className="ml-2 h-4 w-4" />ניתוח עמוק
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
