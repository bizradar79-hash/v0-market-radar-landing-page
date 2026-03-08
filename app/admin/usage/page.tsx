"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ProviderStat { used: number; limit: number; percent: number }

interface UsageStats {
  groq: ProviderStat
  gemini: ProviderStat
  tavily: ProviderStat
  serper: ProviderStat
  bothExhausted: boolean
  activeProvider: string
  activeSearch: string
  recent: Array<{ provider: string; tokens: number; created_at: string }>
}

function ProviderBar({ label, used, limit, percent, unit = 'tokens' }: {
  label: string; used: number; limit: number; percent: number; unit?: string
}) {
  const color = percent >= 100 ? 'bg-red-500' : percent >= 80 ? 'bg-orange-500' : 'bg-green-500'
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {used.toLocaleString()} / {limit.toLocaleString()} {unit} ({percent}%)
        </span>
      </div>
      <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

export default function AdminUsagePage() {
  const [stats, setStats] = useState<UsageStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/usage-stats')
      if (res.ok) {
        setStats(await res.json())
        setLastRefresh(new Date())
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
    const interval = setInterval(fetchStats, 30_000)
    return () => clearInterval(interval)
  }, [fetchStats])

  function aiLabel(p: string) {
    if (p === 'groq') return 'Groq (llama-3.3-70b)'
    if (p === 'gemini') return 'Gemini 2.0 Flash'
    return 'אין — שניהם מוצו'
  }

  function searchLabel(p: string) {
    if (p === 'tavily') return 'Tavily'
    if (p === 'serper') return 'Serper'
    return 'אין — שניהם מוצו'
  }

  function badgeVariant(p: string): 'default' | 'destructive' | 'outline' {
    return p === 'none' ? 'destructive' : 'default'
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">ניצול APIs</h1>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-xs text-muted-foreground">
              עודכן: {lastRefresh.toLocaleTimeString('he-IL')}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={fetchStats} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {loading && !stats ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : stats ? (
        <>
          {/* AI Providers */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span>AI — ניצול יומי (24 שעות)</span>
                <Badge variant={badgeVariant(stats.activeProvider)}>
                  {aiLabel(stats.activeProvider)}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <ProviderBar label="Groq (llama-3.3-70b)" {...stats.groq} />
              <ProviderBar label="Gemini 2.0 Flash" {...stats.gemini} />
              {stats.bothExhausted && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  שני ספקי AI מוצו — ניתוחים יתאפשרו לאחר איפוס (24 שעות)
                </div>
              )}
            </CardContent>
          </Card>

          {/* Search Providers */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span>חיפוש — ניצול חודשי</span>
                <Badge variant={badgeVariant(stats.activeSearch)}>
                  {searchLabel(stats.activeSearch)}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <ProviderBar label="Tavily" {...stats.tavily} unit="חיפושים" />
              <ProviderBar label="Serper" {...stats.serper} unit="חיפושים" />
              {stats.activeSearch === 'none' && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  שני ספקי החיפוש מוצו — תוצאות ריקות עד לחידוש החשבון
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent activity */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">20 בקשות אחרונות</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.recent.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-4">אין נתונים עדיין</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="py-2 text-right font-medium">ספק</th>
                        <th className="py-2 text-right font-medium">טוקנים/חיפושים</th>
                        <th className="py-2 text-right font-medium">זמן</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.recent.map((row, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-2">
                            <Badge variant="outline" className="text-xs">{row.provider}</Badge>
                          </td>
                          <td className="py-2">
                            {['tavily', 'serper'].includes(row.provider) ? '1 חיפוש' : row.tokens.toLocaleString()}
                          </td>
                          <td className="py-2 text-muted-foreground">
                            {new Date(row.created_at).toLocaleString('he-IL', {
                              hour: '2-digit', minute: '2-digit', second: '2-digit',
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <p className="text-center text-muted-foreground">לא ניתן לטעון נתונים</p>
      )}
    </div>
  )
}
