"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  TrendingUp, TrendingDown, Minus, Loader2,
  Plus, Hash, ChevronDown, X, RefreshCw,
  Zap, Users, Lightbulb,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

// ─── Keyword trend types (unchanged) ────────────────────────────────────────
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
interface KwTrendsMap { [keyword: string]: KwData }

// ─── Industry trends types ───────────────────────────────────────────────────
interface IndustryTrend {
  name: string
  direction: 'rising' | 'stable' | 'declining'
  evidence: string
  source: string
  week_data: number[]
  confidence: number
  region: 'ישראל' | 'עולם'
}
interface IndustryTrendsData {
  trends: IndustryTrend[]
  date_range: string
  search_query: string
  fetchedAt: string
}

// ─── Competitor trends types ─────────────────────────────────────────────────
interface CompetitorTrendEntry {
  competitor_name: string
  competitor_website: string
  trending_topics: string[]
  new_activity: string
  opportunity: string
  has_opportunity: boolean
}
interface CompetitorTrendsData {
  competitor_data: CompetitorTrendEntry[]
  fetchedAt: string
}

// ─── Shared helpers ──────────────────────────────────────────────────────────
function DirectionBadge({ direction }: { direction: string }) {
  if (direction === 'rising' || direction === 'עולה') {
    return <Badge className="bg-green-100 text-green-700 border-green-200 shrink-0 text-xs"><TrendingUp className="ml-1 h-3 w-3" />עולה</Badge>
  }
  if (direction === 'declining' || direction === 'יורד') {
    return <Badge className="bg-red-100 text-red-700 border-red-200 shrink-0 text-xs"><TrendingDown className="ml-1 h-3 w-3" />יורד</Badge>
  }
  return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 shrink-0 text-xs"><Minus className="ml-1 h-3 w-3" />יציב</Badge>
}

function MiniSparkline({ data, direction }: { data: number[]; direction: string }) {
  if (!data || data.length < 2) return null
  const W = 64, H = 24
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W
    const y = H - 2 - ((v - min) / range) * (H - 4)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const color = direction === 'rising' ? '#16a34a' : direction === 'declining' ? '#dc2626' : '#9ca3af'
  return (
    <svg width={W} height={H} className="shrink-0">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
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

function getMomentumBadge(direction: string) {
  if (direction === 'עולה' || direction === 'up') {
    return <Badge className="bg-green-100 text-green-700 shrink-0"><TrendingUp className="ml-1 h-3 w-3" />עולה</Badge>
  }
  if (direction === 'יורד' || direction === 'down') {
    return <Badge className="bg-red-100 text-red-700 shrink-0"><TrendingDown className="ml-1 h-3 w-3" />יורד</Badge>
  }
  return <Badge className="bg-yellow-100 text-yellow-700 shrink-0"><Minus className="ml-1 h-3 w-3" />יציב</Badge>
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
      <Minus className="h-8 w-8 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  )
}

function getTrendInsight(name: string, direction: string): string {
  if (direction === 'rising' || direction === 'עולה') {
    return `"${name}" בעלייה — שקול להתמקד בתחום זה עכשיו כדי לנצל את הגל`
  }
  if (direction === 'declining' || direction === 'יורד') {
    return `"${name}" בירידה — בחן האם להפחית השקעה בתחום זה`
  }
  return `"${name}" יציב — שמור על הנוכחות הקיימת שלך בתחום זה`
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function TrendsPage() {
  const [loading, setLoading] = useState(true)

  const [syncDates, setSyncDates] = useState<{ last_sync_at: string | null; next_sync_at: string | null } | null>(null)

  // Section 1 — keyword trends (unchanged logic)
  const [keywords, setKeywords] = useState<string[]>([])
  const [kwTrends, setKwTrends] = useState<KwTrendsMap>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loadingKw, setLoadingKw] = useState<Record<string, boolean>>({})
  const [showAddKw, setShowAddKw] = useState(false)
  const [newKw, setNewKw] = useState('')
  const [addingKw, setAddingKw] = useState(false)
  const [activeTab, setActiveTab] = useState<Record<string, 'israel' | 'world'>>({})
  const [infoExpanded, setInfoExpanded] = useState(false)

  const [selectedTrend, setSelectedTrend] = useState<{
    name: string
    direction: string
    evidence?: string
    source?: string
    week_data?: number[]
    trend_data?: { week: string; value: number }[]
  } | null>(null)

  // Section 2 — industry trends
  const [industryTrends, setIndustryTrends] = useState<IndustryTrendsData | null>(null)
  const [loadingIndustry, setLoadingIndustry] = useState(false)
  const [industryTab, setIndustryTab] = useState<'ישראל' | 'עולם'>('ישראל')

  // Section 3 — competitor trends
  const [competitorTrends, setCompetitorTrends] = useState<CompetitorTrendsData | null>(null)
  const [loadingCompetitor, setLoadingCompetitor] = useState(false)

  const supabase = createClient()
  const { toast } = useToast()

  useEffect(() => { init() }, [])

  async function init() {
    await Promise.all([fetchKeywordData(), fetchIndustryTrends(), fetchCompetitorTrends()])
    setLoading(false)
  }

  // ── Section 1 helpers ──────────────────────────────────────────────────────
  async function fetchKeywordData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('companies').select('keywords, keyword_trends, last_sync_at, next_sync_at').eq('id', user.id).single()
    if (data?.keywords) setKeywords(data.keywords)
    if (data?.keyword_trends && Object.keys(data.keyword_trends).length > 0) {
      setKwTrends(data.keyword_trends as KwTrendsMap)
    }
    if (data) setSyncDates({ last_sync_at: (data as any).last_sync_at ?? null, next_sync_at: (data as any).next_sync_at ?? null })
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
      }
    } catch {}
    finally { setLoadingKw(prev => ({ ...prev, [kw]: false })) }
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

  // ── Section 2 helpers ──────────────────────────────────────────────────────
  async function fetchIndustryTrends(force = false) {
    setLoadingIndustry(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      if (!force) {
        const { data } = await supabase
          .from('companies').select('industry_trends').eq('id', user.id).single()
        const cached = (data as any)?.industry_trends as IndustryTrendsData | null
        if (cached?.fetchedAt && Array.isArray(cached?.trends)) {
          setIndustryTrends(cached)
          return
        }
      }
      const res = await fetch(`/api/industry-trends${force ? '?force=true' : ''}`, { method: 'POST' })
      const d = await res.json()
      if (d.success && Array.isArray(d.trends)) setIndustryTrends(d as IndustryTrendsData)
    } catch {}
    finally { setLoadingIndustry(false) }
  }

  // ── Section 3 helpers ──────────────────────────────────────────────────────
  async function fetchCompetitorTrends(force = false) {
    setLoadingCompetitor(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      if (!force) {
        const { data } = await supabase
          .from('companies').select('competitor_trends').eq('id', user.id).single()
        const cached = (data as any)?.competitor_trends as CompetitorTrendsData | null
        if (cached?.fetchedAt && Array.isArray(cached?.competitor_data)) {
          setCompetitorTrends(cached)
          return
        }
      }
      const res = await fetch(`/api/competitor-trends${force ? '?force=true' : ''}`, { method: 'POST' })
      const d = await res.json()
      if (d.success) setCompetitorTrends(d as CompetitorTrendsData)
    } catch {}
    finally { setLoadingCompetitor(false) }
  }


  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">טרנדים</h1>
        <p className="text-sm text-muted-foreground">מגמות שוק, תחום, ומתחרים בזמן אמת</p>
        {syncDates && (
          <p className="text-xs text-muted-foreground mt-1">
            עודכן: {syncDates.last_sync_at ? new Date(syncDates.last_sync_at).toLocaleDateString('he-IL') : '—'} | עדכון הבא: {syncDates.next_sync_at ? new Date(syncDates.next_sync_at).toLocaleDateString('he-IL') : '—'}
          </p>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 1 — keyword trends (preserved as-is)                         */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
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
              <p className="text-sm text-muted-foreground mt-1">הוסף מילת מפתח — AI יחפש מה טרנדי עכשיו</p>
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
                          {t.trend_data?.length >= 2 && (
                            <button
                              onClick={() => setSelectedTrend({ name: t.phrase, direction: t.trend, trend_data: t.trend_data })}
                              className="cursor-pointer hover:opacity-80 transition-opacity"
                              title="לחץ לפרטים"
                            >
                              <Sparkline data={t.trend_data} trend={t.trend} />
                            </button>
                          )}
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
                    <p>לחץ על כפתור הרענון כדי לטעון טרנדים עבור &quot;{kw}&quot;</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 2 — industry trends                                          */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <div className="space-y-3">
        <div className="border-b pb-2">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            טרנדים חמים בתחום
          </h2>
          <p className="text-sm text-muted-foreground">מה קורה עכשיו בענף שלך — ישראל ועולם</p>
        </div>

        {loadingIndustry ? (
          <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
            <p className="text-sm">מחפש טרנדים חמים בתחום שלך...</p>
          </div>
        ) : !industryTrends || industryTrends.trends.length === 0 ? (
          <EmptyState message="לא נמצאו טרנדים השבוע — הנתונים יתעדכנו בסנכרון הבא" />
        ) : (
          <div className="space-y-3">
            {/* Meta bar */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-muted-foreground">
                מבוסס על נתוני {industryTrends.date_range} · חיפוש: "{industryTrends.search_query}"
              </p>
              {/* Israel / World tabs */}
              <div className="flex gap-1 p-0.5 bg-muted/40 rounded-lg">
                {(['ישראל', 'עולם'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setIndustryTab(tab)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      industryTab === tab
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {tab === 'ישראל' ? '🇮🇱 ישראל' : '🌍 עולם'}
                  </button>
                ))}
              </div>
            </div>

            {/* Trend cards */}
            {(() => {
              const filtered = industryTrends.trends.filter(t => t.region === industryTab)
              if (filtered.length === 0) {
                return <EmptyState message={`לא נמצאו טרנדים מ${industryTab} השבוע`} />
              }
              return (
                <div className="grid gap-3 md:grid-cols-2">
                  {filtered.map((t, i) => (
                    <Card key={i} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-sm leading-snug flex-1">{t.name}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => setSelectedTrend({ name: t.name, direction: t.direction, evidence: t.evidence, source: t.source, week_data: t.week_data })}
                              className="cursor-pointer hover:opacity-80 transition-opacity"
                              title="לחץ לפרטים"
                            >
                              <MiniSparkline data={t.week_data} direction={t.direction} />
                            </button>
                            <DirectionBadge direction={t.direction} />
                          </div>
                        </div>
                        {t.evidence && (
                          <blockquote className="border-r-2 border-primary/30 pr-3 text-xs text-muted-foreground italic leading-relaxed">
                            {t.evidence}
                          </blockquote>
                        )}
                        {t.source && (
                          <p className="text-[10px] text-muted-foreground/60">מקור: {t.source}</p>
                        )}
                        {/* Confidence bar */}
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${t.confidence >= 70 ? 'bg-green-500' : t.confidence >= 40 ? 'bg-yellow-500' : 'bg-red-400'}`}
                              style={{ width: `${t.confidence}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground shrink-0">{t.confidence}%</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )
            })()}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 3 — competitor trends                                        */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <div className="space-y-3">
        <div className="border-b pb-2">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            טרנדים אצל המתחרים
          </h2>
          <p className="text-sm text-muted-foreground">מה עושים המתחרים שלך עכשיו — וכיצד לנצל את זה</p>
        </div>

        {loadingCompetitor ? (
          <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
            <p className="text-sm">בודק פעילות מתחרים...</p>
          </div>
        ) : !competitorTrends || competitorTrends.competitor_data.length === 0 ? (
          <EmptyState message="לא נמצאו נתוני מתחרים — הנתונים יתעדכנו בסנכרון הבא" />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {competitorTrends.competitor_data.map((c, i) => (
              <Card key={i} className={c.has_opportunity ? 'border-amber-200 shadow-sm' : ''}>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>{c.competitor_name}</span>
                    {c.competitor_website && (
                      <a
                        href={c.competitor_website.startsWith('http') ? c.competitor_website : `https://${c.competitor_website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline font-normal"
                      >
                        {c.competitor_website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
                      </a>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  {/* Trending topics */}
                  {c.trending_topics.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">נושאים שמקדמים</p>
                      <div className="flex flex-wrap gap-1.5">
                        {c.trending_topics.map((topic, ti) => (
                          <Badge key={ti} variant="secondary" className="text-xs font-normal">{topic}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* New activity */}
                  {c.new_activity && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">פעילות אחרונה</p>
                      <p className="text-xs text-foreground leading-relaxed">{c.new_activity}</p>
                    </div>
                  )}

                  {/* Opportunity box */}
                  {c.opportunity && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1">
                      <p className="text-xs font-semibold text-amber-800 flex items-center gap-1">
                        <Lightbulb className="h-3.5 w-3.5" />הזדמנות עבורך
                      </p>
                      <p className="text-xs text-amber-700 leading-relaxed">{c.opportunity}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {competitorTrends?.fetchedAt && (
          <p className="text-xs text-muted-foreground">
            עודכן: {new Date(competitorTrends.fetchedAt).toLocaleDateString('he-IL')}
          </p>
        )}
      </div>

      {/* Trend detail modal */}
      <Dialog open={!!selectedTrend} onOpenChange={open => { if (!open) setSelectedTrend(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-right">{selectedTrend?.name}</DialogTitle>
          </DialogHeader>
          {selectedTrend && (
            <div className="space-y-4">
              {/* Large graph */}
              <div className="flex justify-center py-2">
                {selectedTrend.week_data ? (
                  <svg width={280} height={80}>
                    {(() => {
                      const data = selectedTrend.week_data!
                      const W = 280, H = 80
                      const min = Math.min(...data), max = Math.max(...data)
                      const range = max - min || 1
                      const pts = data.map((v, i) => {
                        const x = (i / (data.length - 1)) * W
                        const y = H - 8 - ((v - min) / range) * (H - 16)
                        return `${x.toFixed(1)},${y.toFixed(1)}`
                      }).join(' ')
                      const color = selectedTrend.direction === 'rising' ? '#16a34a' : selectedTrend.direction === 'declining' ? '#dc2626' : '#9ca3af'
                      return <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    })()}
                  </svg>
                ) : selectedTrend.trend_data ? (
                  <Sparkline data={selectedTrend.trend_data} trend={selectedTrend.direction} />
                ) : null}
              </div>

              {selectedTrend.evidence && (
                <blockquote className="border-r-2 border-primary/30 pr-3 text-sm text-muted-foreground italic">
                  {selectedTrend.evidence}
                </blockquote>
              )}

              {selectedTrend.source && (
                <p className="text-xs text-muted-foreground">מקור: {selectedTrend.source}</p>
              )}

              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
                <p className="text-xs font-medium text-primary mb-1">מה זה אומר לעסק שלך</p>
                <p className="text-sm text-foreground">{getTrendInsight(selectedTrend.name, selectedTrend.direction)}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  )
}
