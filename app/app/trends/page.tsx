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
  Plus, Hash, ChevronDown, X,
  Zap, Users, Lightbulb,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

// ─── Keyword-intelligence types (Google Ads search volume) ──────────────────
interface StoredRelated {
  keyword: string
  searchVolume: number
  cpc?: number
  changePct?: number
  direction?: string            // 'rising' | 'falling' | 'stable'
  directionHe?: string
  competition?: string
  competitionHe?: string
  opportunityScore?: number
  opportunityLevel?: 'hot' | 'good' | null
  action?: string
}
interface KwData {
  keyword?: string
  searchVolume: number          // avg monthly searches (absolute)
  avgVolume12mo: number
  changePct: number             // recent 3-mo vs prior 3-mo
  direction: string             // 'rising' | 'falling' | 'stable'
  directionHe?: string
  cpc: number
  competition: string           // LOW | MEDIUM | HIGH | UNKNOWN
  competitionHe?: string
  competitionIndex?: number
  lowData?: boolean
  monthlySeries: number[]       // chronological, for sparkline
  related: StoredRelated[]
  insight: string
  fetchedAt: string
  provider?: string
}
interface KwTrendsMap { [keyword: string]: KwData }

function fmtVol(n: number): string {
  if (!n || n < 1) return '—'
  return n.toLocaleString('he-IL')
}

// Volume sparkline over the 12-month monthly series (absolute numbers).
function VolumeSparkline({ data, direction }: { data: number[]; direction: string }) {
  if (!data || data.length < 2) return null
  const W = 220, H = 44
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W
    const y = H - 4 - ((v - min) / range) * (H - 8)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const lastX = W
  const lastY = H - 4 - ((data[data.length - 1] - min) / range) * (H - 8)
  const color = direction === 'rising' ? '#16a34a' : direction === 'falling' ? '#dc2626' : '#9ca3af'
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block" height={H}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX.toFixed(1)} cy={lastY.toFixed(1)} r="3" fill={color} />
    </svg>
  )
}

// Headline trend arrow + real %, or "נתון נמוך" when the baseline is too small.
function TrendArrow({ direction, changePct, lowData }: { direction: string; changePct: number; lowData?: boolean }) {
  const up = direction === 'rising'
  const down = direction === 'falling'
  const color = up ? 'text-green-600' : down ? 'text-red-600' : 'text-yellow-600'
  const Icon = up ? TrendingUp : down ? TrendingDown : Minus
  const sign = changePct > 0 ? '+' : ''
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-semibold tabular-nums ${color}`}>
      <Icon className="h-4 w-4" />
      {lowData || changePct === 0 ? (up || down ? '—' : '0%') : `${sign}${changePct}%`}
    </span>
  )
}

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

    // HARD limit: only first 8 keywords
    const first8: string[] = ((data?.keywords as string[]) || []).slice(0, 8)
    setKeywords(first8)

    if (data?.keyword_trends && Object.keys(data.keyword_trends).length > 0) {
      const allTrends = data.keyword_trends as KwTrendsMap
      // Keep only entries that belong to first 8 keywords
      const trimmed: KwTrendsMap = {}
      for (const kw of first8) {
        if (allTrends[kw]) trimmed[kw] = allTrends[kw]
      }
      setKwTrends(trimmed)

      // Persist cleanup if DB had extra keys
      const dbKeys = Object.keys(allTrends)
      const extraKeys = dbKeys.filter(k => !first8.includes(k))
      if (extraKeys.length > 0) {
        supabase.from('companies')
          .update({ keyword_trends: trimmed, keywords: first8 })
          .eq('id', user.id)
          .then(() => {}) // fire-and-forget, non-blocking
      }
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
      if (data.success && data.data) {
        setKwTrends(prev => ({ ...prev, [kw]: data.data as KwData }))
        setExpanded(prev => new Set([...prev, kw]))
        toast({ title: `טרנדים עודכנו: ${kw}` })
      } else if (data.success) {
        toast({ title: `אין נתונים עבור: ${kw}` })
      }
    } catch {}
    finally { setLoadingKw(prev => ({ ...prev, [kw]: false })) }
  }

  async function addKeyword() {
    const kw = newKw.trim()
    if (!kw || keywords.includes(kw) || keywords.length >= 8) return
    setAddingKw(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setAddingKw(false); return }
    const newList = [...keywords, kw].slice(0, 8)
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
        // DISPLAY-ONLY on mount: read the cached field, never generate on view.
        // (Generation happens during scans / admin sync.) Empty → empty state.
        const { data } = await supabase
          .from('companies').select('industry_trends').eq('id', user.id).single()
        const cached = (data as any)?.industry_trends as IndustryTrendsData | null
        if (cached?.fetchedAt && Array.isArray(cached?.trends)) setIndustryTrends(cached)
        return
      }
      // force=true only: user-/admin-initiated regeneration.
      const res = await fetch(`/api/industry-trends?force=true`, { method: 'POST' })
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
        // DISPLAY-ONLY on mount: read the cached field, never generate on view.
        const { data } = await supabase
          .from('companies').select('competitor_trends').eq('id', user.id).single()
        const cached = (data as any)?.competitor_trends as CompetitorTrendsData | null
        if (cached?.fetchedAt && Array.isArray(cached?.competitor_data)) setCompetitorTrends(cached)
        return
      }
      // force=true only: user-/admin-initiated regeneration.
      const res = await fetch(`/api/competitor-trends?force=true`, { method: 'POST' })
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
            <h2 className="text-lg font-semibold text-foreground">מודיעין מילות מפתח</h2>
            <p className="text-sm text-muted-foreground">נפח חיפוש חודשי, מגמה והזדמנויות לכל מילת מפתח ({keywords.length}/8)</p>
          </div>
          {keywords.length < 8 && !showAddKw ? (
            <Button variant="outline" size="sm" onClick={() => setShowAddKw(true)}>
              <Plus className="ml-2 h-3.5 w-3.5" />הוסף מילת מפתח
            </Button>
          ) : keywords.length >= 8 ? (
            <span className="text-xs text-muted-foreground">הגעת למקסימום 8 מילות מפתח</span>
          ) : null}
        </div>

        {/* Data source info box */}
        <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-sm">
          {!infoExpanded ? (
            <button onClick={() => setInfoExpanded(true)} className="text-blue-700 font-medium">
              📡 מאיפה מגיעים הנתונים? ▼
            </button>
          ) : (
            <div className="space-y-1 text-blue-800 leading-relaxed">
              <p>מבוסס על Google Ads · DataForSEO — נפחי חיפוש אמיתיים</p>
              <p>לכל מילת מפתח מוצג נפח החיפוש החודשי הממוצע בישראל (מספרים אמיתיים, לא גרף יחסי), מגמה לפי 3 חודשים אחרונים מול הקודמים, עלות קליק (CPC), רמת תחרות, היסטוריית 12 חודשים, וביטויי לונג-טייל קשורים עם נפח החיפוש שלהם.</p>
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
              <p className="text-sm text-muted-foreground mt-1">הוסף מילת מפתח — נציג נפח חיפוש חודשי ומגמה אמיתיים</p>
            </div>
            <Button onClick={() => setShowAddKw(true)}>
              <Plus className="ml-2 h-4 w-4" />הוסף מילת מפתח
            </Button>
          </div>
        )}

        {/* Per-keyword actionable cards (hierarchical) */}
        {keywords.map(kw => {
          const kwData = kwTrends[kw]
          const isExpanded = expanded.has(kw)
          const isLoading = !!loadingKw[kw]
          const isRising = kwData?.direction === 'rising' && !kwData?.lowData
          const hasVolume = !!kwData && kwData.searchVolume > 0

          return (
            <Card key={kw} className={isRising ? 'border-green-200 shadow-sm' : ''}>
              <CardContent className="p-4">
                {/* HEADLINE */}
                <div className="flex items-start justify-between gap-2">
                  <button
                    onClick={() => kwData && toggleExpanded(kw)}
                    className="flex items-start gap-2 text-right min-w-0 flex-1"
                    disabled={!kwData}
                  >
                    <Hash className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold truncate">{kw}</span>
                        {kwData && (
                          <TrendArrow direction={kwData.direction} changePct={kwData.changePct} lowData={kwData.lowData} />
                        )}
                        {isRising && (
                          <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px] shrink-0">🔥 הזדמנות</Badge>
                        )}
                      </div>
                      {kwData && (
                        <div className="flex items-baseline gap-1.5 mt-1">
                          <span className="text-2xl font-bold tabular-nums text-foreground leading-none">{fmtVol(kwData.searchVolume)}</span>
                          <span className="text-xs text-muted-foreground">חיפושים / חודש</span>
                        </div>
                      )}
                    </div>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                    {kwData && (
                      <button onClick={() => toggleExpanded(kw)} className="p-1 text-muted-foreground" title={isExpanded ? 'הסתר' : 'פרטים'}>
                        <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeKeyword(kw)} title="הסר מילת מפתח">
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* INSIGHT line */}
                {kwData?.insight && (
                  <p className="mt-2 text-sm text-foreground/90 leading-relaxed">{kwData.insight}</p>
                )}

                {isLoading && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>טוען נפחי חיפוש מ-Google Ads...</span>
                  </div>
                )}

                {/* EXPANDABLE detail */}
                {isExpanded && !isLoading && kwData && (
                  <div className="mt-3 pt-3 border-t space-y-3">
                    {/* Stat row */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg bg-muted/40 p-2 text-center">
                        <div className="text-[10px] text-muted-foreground">ממוצע 12 חו׳</div>
                        <div className="text-sm font-semibold tabular-nums">{fmtVol(kwData.avgVolume12mo)}</div>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-2 text-center">
                        <div className="text-[10px] text-muted-foreground">CPC (עלות קליק)</div>
                        <div className="text-sm font-semibold tabular-nums">{kwData.cpc > 0 ? `$${kwData.cpc.toFixed(2)}` : '—'}</div>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-2 text-center">
                        <div className="text-[10px] text-muted-foreground">תחרות</div>
                        <div className="text-sm font-semibold">{kwData.competitionHe || '—'}</div>
                      </div>
                    </div>

                    {/* 12-month sparkline */}
                    {kwData.monthlySeries && kwData.monthlySeries.length >= 2 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">היסטוריית חיפוש (12 חודשים)</p>
                        <VolumeSparkline data={kwData.monthlySeries} direction={kwData.direction} />
                      </div>
                    )}

                    {/* Related long-tails — ranked by OPPORTUNITY, not raw volume */}
                    {kwData.related && kwData.related.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-muted-foreground">הזדמנויות לונג-טייל (לפי פוטנציאל כניסה)</p>
                        <div className="space-y-1.5">
                          {[...kwData.related]
                            .sort((a, b) => (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0))
                            .slice(0, 3)
                            .map((r, i) => (
                              <div key={i} className="rounded-lg border px-2.5 py-1.5 text-xs">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="flex items-center gap-1.5 min-w-0">
                                    {r.opportunityLevel === 'hot' && <span className="shrink-0" title="הזדמנות חמה">🔥</span>}
                                    {r.opportunityLevel === 'good' && <span className="shrink-0" title="הזדמנות טובה">💎</span>}
                                    <span className="truncate font-medium">{r.keyword}</span>
                                  </span>
                                  <span className="flex items-center gap-2 shrink-0">
                                    <span className="text-muted-foreground tabular-nums">{fmtVol(r.searchVolume)}/חו׳</span>
                                    {typeof r.changePct === 'number' && r.direction && (
                                      <TrendArrow direction={r.direction} changePct={r.changePct} />
                                    )}
                                  </span>
                                </div>
                                {r.action && (
                                  <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{r.action}</p>
                                )}
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {!hasVolume && (
                      <p className="text-xs text-amber-600">נתוני נפח חיפוש לא זמינים עבור מילה זו (הוערך לפי AI).</p>
                    )}

                    <p className="text-xs text-muted-foreground">
                      מקור: Google Ads · DataForSEO · עודכן: {new Date(kwData.fetchedAt).toLocaleDateString('he-IL')}
                    </p>
                  </div>
                )}

                {!isLoading && !kwData && (
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <p className="text-sm text-muted-foreground">נתונים עבור &quot;{kw}&quot; יטענו בסנכרון הבא</p>
                    <Button variant="outline" size="sm" onClick={() => refreshKeywordTrend(kw)}>טען עכשיו</Button>
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
