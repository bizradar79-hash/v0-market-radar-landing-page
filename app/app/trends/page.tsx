"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  TrendingUp, TrendingDown, Minus, Loader2, Sparkles,
  Plus, Hash, ChevronDown, X, RefreshCw,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

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
  trends?: KwTrend[]  // backward-compat (old records without israel/world)
  israel?: KwTrend[]
  world?: KwTrend[]
}

interface KwTrendsMap {
  [keyword: string]: KwData
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

export default function TrendsPage() {
  const [trends, setTrends] = useState<Trend[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

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
    fetchTrends()
    fetchKeywordData()
  }, [])

  async function fetchTrends() {
    const { data, error } = await supabase
      .from("trends").select("*").order("created_at", { ascending: false })
    if (!error && data) setTrends(data)
    setLoading(false)
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
      toast({ title: "שגיאה", description: "אירעה שגיאה", variant: "destructive" })
    } finally {
      setGenerating(false)
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
        if (data.saveError) {
          toast({ title: `טרנדים נטענו אך לא נשמרו`, description: data.saveError, variant: 'destructive' })
        } else {
          toast({ title: `טרנדים עודכנו: ${kw}` })
        }
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
    // Also prune from keyword_trends
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

  const sources = Object.keys(sourceGroups)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">טרנדים</h1>
          <p className="text-muted-foreground">מעקב אחר מגמות שוק ותחומים מתפתחים</p>
        </div>
        <Button onClick={generateTrends} disabled={generating}>
          {generating
            ? <><Loader2 className="ml-2 h-4 w-4 animate-spin" />מנתח טרנדים...</>
            : <><Sparkles className="ml-2 h-4 w-4" />גלה טרנדים עם AI</>
          }
        </Button>
      </div>

      {/* ─── Keyword Trends Section ─── */}
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
            <button
              onClick={() => setInfoExpanded(true)}
              className="text-blue-700 font-medium"
            >
              📡 מאיפה מגיעים הנתונים? ▼
            </button>
          ) : (
            <div className="space-y-1 text-blue-800 leading-relaxed">
              <p>הטרנדים מחושבים על ידי AI שסורק בזמן אמת חיפושים, פורומים, רשתות חברתיות</p>
              <p>וחדשות בישראל — ומזהה אילו ביטויים נמצאים בעלייה, ירידה או יציבים השבוע.</p>
              <p>הנתונים מתעדכנים אחת לשבוע ומשקפים את מה שאנשים מחפשים ומדברים עליו</p>
              <p>בתחום שלך ממש עכשיו.</p>
              <button
                onClick={() => setInfoExpanded(false)}
                className="text-blue-700 font-medium mt-1 block"
              >
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
              <p className="text-sm text-muted-foreground mt-1">הוסף מילת מפתח ו-AI יחפש מה טרנדי עכשיו בישראל</p>
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

          // Resolve trend lists — support both old format (trends) and new (israel/world)
          const israelTrends = kwData?.israel || kwData?.trends || []
          const worldTrends = kwData?.world || []
          const hasWorld = worldTrends.length > 0
          const tab = activeTab[kw] || 'israel'
          const displayTrends = tab === 'world' ? worldTrends : israelTrends

          return (
            <Card key={kw}>
              <CardContent className="p-4">
                {/* Card header row */}
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => toggleExpanded(kw)}
                    className="flex items-center gap-2 text-right"
                  >
                    <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium">{kw}</span>
                    {kwData && (
                      <span className="text-xs text-muted-foreground">
                        {israelTrends.length} טרנדים
                      </span>
                    )}
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => refreshKeywordTrend(kw)}
                      disabled={isLoading}
                      title="רענן טרנדים"
                    >
                      {isLoading
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <RefreshCw className="h-3.5 w-3.5" />
                      }
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeKeyword(kw)}
                      title="הסר מילת מפתח"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Loading state */}
                {isLoading && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>מחפש טרנדים בישראל ובעולם...</span>
                  </div>
                )}

                {/* Expanded trends list */}
                {isExpanded && !isLoading && kwData && (
                  <div className="mt-3">
                    {/* Israel / World tabs — only shown when world data exists */}
                    {hasWorld && (
                      <div className="flex border-b mb-3">
                        <button
                          onClick={() => setActiveTab(prev => ({ ...prev, [kw]: 'israel' }))}
                          className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
                            tab === 'israel'
                              ? 'border-primary text-primary'
                              : 'border-transparent text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          🇮🇱 ישראל
                        </button>
                        <button
                          onClick={() => setActiveTab(prev => ({ ...prev, [kw]: 'world' }))}
                          className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
                            tab === 'world'
                              ? 'border-primary text-primary'
                              : 'border-transparent text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          🌍 עולם
                        </button>
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
                            <Sparkline data={t.trend_data} trend={t.trend} />
                          )}
                        </div>
                      ))}
                    </div>

                    <p className="text-xs text-muted-foreground pt-2">
                      עודכן: {new Date(kwData.fetchedAt).toLocaleDateString('he-IL')}
                    </p>
                  </div>
                )}

                {/* Empty state when expanded but no data */}
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

      {/* ─── General Trends Section ─── */}
      {sources.map((source) => (
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

      {trends.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <TrendingUp className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">לא נמצאו טרנדים</p>
            <Button className="mt-4" onClick={generateTrends} disabled={generating}>
              <Sparkles className="ml-2 h-4 w-4" />גלה טרנדים עם AI
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
