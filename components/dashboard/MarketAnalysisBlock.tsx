"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Search, Bookmark } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import MarketAnalysisPanelView from "./MarketAnalysisPanelView"
import type { MarketAnalysis } from "@/types/market-analysis"

const REGIONS = ['כל ישראל', 'תל אביב', 'ירושלים', 'חיפה', 'באר שבע', 'אשקלון', 'גלובלי']
const CATEGORIES = ['כללי', 'בריאות', 'טכנולוגיה', 'חינוך', 'מזון', 'נדל"ן', 'פיננסים', 'קמעונאות']

export default function MarketAnalysisBlock() {
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState('כל ישראל')
  const [category, setCategory] = useState('כללי')
  const [loading, setLoading] = useState(false)
  const [analysis, setAnalysis] = useState<MarketAnalysis | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recentAnalyses, setRecentAnalyses] = useState<{ id: string; query: string }[]>([])
  const [savedAnalysisTitles, setSavedAnalysisTitles] = useState<Set<string>>(new Set())
  const supabase = createClient()

  useEffect(() => {
    loadRecentAnalyses()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('saved_items').select('title').eq('company_id', user.id).eq('item_type', 'market_analysis').then(({ data }) => {
        if (data) setSavedAnalysisTitles(new Set(data.map((s: any) => s.title)))
      })
    })
  }, [])

  async function loadRecentAnalyses() {
    try {
      const { data } = await supabase
        .from('market_analyses')
        .select('id, query')
        .order('created_at', { ascending: false })
        .limit(3)
      if (data) setRecentAnalyses(data)
    } catch {
      // silent
    }
  }

  async function handleAnalyze() {
    if (!query.trim() || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/analyze-market', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), region, category }),
      })
      const json = await res.json()
      if (json.analysis) {
        setAnalysis(json.analysis)
        loadRecentAnalyses()
      } else {
        setError('לא ניתן לבצע את הניתוח כרגע. נסה שוב.')
      }
    } catch {
      setError('לא ניתן לבצע את הניתוח כרגע. נסה שוב.')
    } finally {
      setLoading(false)
    }
  }

  async function loadSavedAnalysis(id: string) {
    try {
      const { data } = await supabase
        .from('market_analyses')
        .select('result')
        .eq('id', id)
        .single()
      if (data?.result) setAnalysis(data.result as MarketAnalysis)
    } catch {
      // silent
    }
  }

  // Results state
  if (analysis) {
    return (
      <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50/40 to-white">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">
                {analysis.query}
              </Badge>
              <Badge variant="outline" className="text-xs text-muted-foreground">{analysis.region}</Badge>
              <Badge variant="outline" className="text-xs text-muted-foreground">{analysis.category}</Badge>
            </div>
            <div className="flex gap-1 items-center">
              {savedAnalysisTitles.has(`ניתוח שוק: ${analysis.query}`) ? (
                <span className="flex items-center gap-1 text-xs border rounded-md px-2 py-1 bg-green-50 text-green-700 border-green-200 cursor-default">✓ נשמר</span>
              ) : (
                <button
                  className="flex items-center gap-1 text-xs border rounded-md px-2 py-1 hover:bg-muted"
                  onClick={async () => {
                    const title = `ניתוח שוק: ${analysis.query}`
                    setSavedAnalysisTitles(prev => new Set([...prev, title]))
                    try {
                      await fetch('/api/saved-items', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          item_type: 'market_analysis',
                          item_id: analysis.id,
                          title,
                          description: (analysis as any).executiveSummary?.slice(0, 160) || null,
                          url: null,
                          source_module: 'ניתוח שוק',
                          metadata: { query: analysis.query, region: analysis.region, category: analysis.category },
                        }),
                      })
                      const win = window as any
                      if (typeof win.refreshSidebarCounts === 'function') win.refreshSidebarCounts()
                    } catch {}
                  }}
                >🔖 שמור</button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 px-2 text-muted-foreground"
                onClick={() => setAnalysis(null)}
              >
                ← ניתוח חדש
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <MarketAnalysisPanelView analysis={analysis} onSaved={loadRecentAnalyses} />
        </CardContent>
      </Card>
    )
  }

  // Search state
  return (
    <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50/30 to-white">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Search className="h-5 w-5 text-emerald-600" />
          ניתוח שוק 🔎
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          בדוק ביקוש, תחרות ופוטנציאל לשירות או מוצר
        </p>
      </CardHeader>
      <CardContent className="space-y-3" dir="rtl">
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="הקלד שירות, מוצר או תחום"
          className="w-full text-right"
          dir="rtl"
          disabled={loading}
          onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
        />

        <div className="flex gap-2">
          <Select value={region} onValueChange={setRegion} disabled={loading}>
            <SelectTrigger className="flex-1" dir="rtl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent dir="rtl">
              {REGIONS.map(r => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={category} onValueChange={setCategory} disabled={loading}>
            <SelectTrigger className="flex-1" dir="rtl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent dir="rtl">
              {CATEGORIES.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={handleAnalyze}
          disabled={loading || !query.trim()}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin ml-2" />
              מנתח נתוני שוק בזמן אמת...
            </>
          ) : (
            "נתח שוק ←"
          )}
        </Button>

        {error && (
          <p className="text-sm text-red-600 text-right">{error}</p>
        )}

        {loading && (
          <div className="rounded-lg border bg-muted/30 p-4 animate-pulse space-y-2">
            <div className="h-3 w-3/4 bg-muted rounded" />
            <div className="h-3 w-full bg-muted rounded" />
            <div className="h-3 w-2/3 bg-muted rounded" />
          </div>
        )}

        {recentAnalyses.length > 0 && !loading && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">ניתוחים אחרונים:</p>
            <div className="flex flex-wrap gap-2">
              {recentAnalyses.map(a => (
                <button
                  key={a.id}
                  onClick={() => loadSavedAnalysis(a.id)}
                  className="text-xs px-2.5 py-1 rounded-full border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                >
                  {a.query}
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
