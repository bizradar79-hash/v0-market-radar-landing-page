"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import Link from "next/link"
import WeeklyActionsBlock from "@/components/dashboard/WeeklyActionsBlock"
import NicheDiscoveryBlock from "@/components/dashboard/NicheDiscoveryBlock"
import MarketAnalysisBlock from "@/components/dashboard/MarketAnalysisBlock"
import {
  Target,
  Star,
  FileText,
  BarChart3,
  Activity,
  ArrowLeft,
  Loader2,
  RefreshCw,
  Building2,
  Calendar,
  Newspaper,
} from "lucide-react"

interface CompanyInfo {
  name: string
  industry: string
  city: string
  website: string
  businessOverview: string
  geographicScope: string
}

interface DashboardData {
  savedOppsCount: number
  tendersCount: number
  competitorsCount: number
  trendsCount: number
  conferencesCount: number
  newsCount: number
  topCompetitors: Array<{ name: string; threat_score: number; services: string }>
  upcomingTenders: Array<{ title: string; organization: string; deadline: string }>
  upcomingConferences: Array<{ name: string; date: string; location: string }>
  topTrends: Array<{ name: string; direction: string; category: string }>
  lastAnalyzed: string | null
  companyInfo: CompanyInfo | null
}

export default function AppDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState("")
  const [bothExhausted, setBothExhausted] = useState(false)
  const supabase = createClient()
  const { toast } = useToast()

  useEffect(() => {
    fetchDashboardData()
    fetch('/api/usage-stats')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.bothExhausted) setBothExhausted(true) })
      .catch(() => {})
  }, [])

  async function fetchDashboardData() {
    const today = new Date().toISOString().split('T')[0]
    const [
      { count: savedOppsCount },
      { count: tendersCount },
      { count: competitorsCount },
      { count: trendsCount },
      { count: conferencesCount },
      { count: newsCount },
      { data: topCompetitors },
      { data: upcomingTenders },
      { data: upcomingConferences },
      { data: topTrends },
      { data: companyData },
    ] = await Promise.all([
      supabase.from("saved_opportunities").select("*", { count: "exact", head: true }),
      supabase.from("tenders").select("*", { count: "exact", head: true }),
      supabase.from("competitors").select("*", { count: "exact", head: true }),
      supabase.from("trends").select("*", { count: "exact", head: true }),
      supabase.from("conferences").select("*", { count: "exact", head: true }),
      supabase.from("news").select("*", { count: "exact", head: true }),
      supabase.from("competitors").select("name, threat_score, services").order("threat_score", { ascending: false }).limit(3),
      supabase.from("tenders").select("title, organization, deadline").order("deadline", { ascending: true }).limit(3),
      supabase.from("conferences").select("name, date, location").gte("date", today).order("date", { ascending: true }).limit(3),
      supabase.from("trends").select("name, direction, category").order("created_at", { ascending: false }).limit(3),
      supabase.from("companies").select("name, industry, city, website, last_analyzed, business_overview, geographic_scope").single(),
    ])

    setData({
      savedOppsCount: savedOppsCount || 0,
      tendersCount: tendersCount || 0,
      competitorsCount: competitorsCount || 0,
      trendsCount: trendsCount || 0,
      conferencesCount: conferencesCount || 0,
      newsCount: newsCount || 0,
      topCompetitors: topCompetitors || [],
      upcomingTenders: upcomingTenders || [],
      upcomingConferences: upcomingConferences || [],
      topTrends: topTrends || [],
      lastAnalyzed: companyData?.last_analyzed || null,
      companyInfo: companyData ? {
        name: companyData.name || '',
        industry: companyData.industry || '',
        city: companyData.city || '',
        website: companyData.website || '',
        businessOverview: companyData.business_overview || '',
        geographicScope: companyData.geographic_scope || 'national',
      } : null,
    })
    setLoading(false)
  }

  async function runFirstScan() {
    setScanning(true)
    const results = { competitors: 0, leads: 0, tenders: 0 }

    const steps = [
      { api: '/api/find-competitors', label: 'מחפש מתחרים...', key: 'competitors' },
      { api: '/api/generate-leads', label: 'מגלה לידים...', key: 'leads' },
      { api: '/api/generate-tenders', label: 'סורק מכרזים...', key: 'tenders' },
    ]

    try {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i]
        setScanProgress(`${step.label} (${i + 1}/${steps.length})`)
        try {
          const res = await fetch(step.api, { method: 'POST' })
          const data = await res.json()
          results[step.key as keyof typeof results] = data.count || 0
        } catch (e) {
          console.error(`Error in ${step.api}:`, e)
        }
        if (i < steps.length - 1) await new Promise(resolve => setTimeout(resolve, 5000))
      }

      setScanProgress("מעדכן נתונים...")
      await fetchDashboardData()

      ;(window as typeof window & { refreshSidebarCounts?: () => void }).refreshSidebarCounts?.()

      toast({
        title: "הסריקה הושלמה בהצלחה!",
        description: `נמצאו ${results.leads} לידים ו-${results.competitors} מתחרים`,
      })
    } catch (error) {
      console.error("Error running scan:", error)
      toast({
        title: "שגיאה",
        description: "אירעה שגיאה בעת הסריקה, נסה שוב",
        variant: "destructive",
      })
    } finally {
      setScanning(false)
      setScanProgress("")
    }
  }

  function formatTimeAgo(dateStr: string | null): string {
    if (!dateStr) return ""
    const date = new Date(dateStr)
    const now = new Date()
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))

    if (diffMinutes < 1) return "עכשיו"
    if (diffMinutes < 60) return `לפני ${diffMinutes} דקות`
    const diffHours = Math.floor(diffMinutes / 60)
    if (diffHours < 24) return `לפני ${diffHours} שעות`
    const diffDays = Math.floor(diffHours / 24)
    return `לפני ${diffDays} ימים`
  }

  const kpiCards = [
    { key: "opps", label: "הזדמנויות", icon: Star, href: "/app/leads", value: data?.savedOppsCount || 0, color: "bg-emerald-100 text-emerald-700" },
    { key: "tenders", label: "מכרזים", icon: FileText, href: "/app/tenders", value: data?.tendersCount || 0, color: "bg-purple-100 text-purple-700" },
    { key: "competitors", label: "מתחרים", icon: Target, href: "/app/competitors", value: data?.competitorsCount || 0, color: "bg-red-100 text-red-700" },
    { key: "trends", label: "טרנדים", icon: Activity, href: "/app/trends", value: data?.trendsCount || 0, color: "bg-blue-100 text-blue-700" },
    { key: "conferences", label: "כנסים", icon: Calendar, href: "/app/conferences", value: data?.conferencesCount || 0, color: "bg-indigo-100 text-indigo-700" },
    { key: "news", label: "חדשות", icon: Newspaper, href: "/app/news", value: data?.newsCount || 0, color: "bg-slate-100 text-slate-700" },
  ]

  function getDaysUntil(deadline: string): number {
    const now = new Date()
    const deadlineDate = new Date(deadline)
    const diff = deadlineDate.getTime() - now.getTime()
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">דשבורד</h1>
          <p className="text-muted-foreground">סקירה כללית של הפעילות העסקית שלך</p>
        </div>
        <div className="flex items-center gap-3">
          {data?.lastAnalyzed && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Activity className="h-4 w-4" />
              <span>ניתוח אחרון: {formatTimeAgo(data.lastAnalyzed)}</span>
            </div>
          )}
          {(data?.competitorsCount || 0) > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={runFirstScan}
              disabled={scanning}
            >
              {scanning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Profile Summary Card */}
      {data?.companyInfo && (
        <Card className="border-primary/20">
          <CardContent className="flex items-start justify-between gap-3 p-3">
            <div className="flex items-start gap-2 min-w-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 shrink-0 mt-0.5">
                <Building2 className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <p className="font-semibold text-sm text-foreground">{data.companyInfo.name}</p>
                  {data.companyInfo.industry && (
                    <Badge variant="secondary" className="text-xs px-1.5 py-0">{data.companyInfo.industry}</Badge>
                  )}
                  {data.companyInfo.city && (
                    <span className="text-xs text-muted-foreground">{data.companyInfo.city}</span>
                  )}
                  <Link href="/app/settings">
                    <Badge className={`text-xs px-1.5 py-0 cursor-pointer hover:opacity-80 ${
                      data.companyInfo.geographicScope === 'international' ? 'bg-teal-100 text-teal-700' :
                      data.companyInfo.geographicScope === 'national' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {data.companyInfo.geographicScope === 'international'
                        ? '🌍 פעיל בינלאומית'
                        : data.companyInfo.geographicScope === 'national'
                        ? '🇮🇱 פעיל בכל ישראל'
                        : `🏙️ פעיל באזור ${data.companyInfo.city}`}
                    </Badge>
                  </Link>
                </div>
                {data.companyInfo.website && (
                  <a
                    href={data.companyInfo.website.startsWith('http') ? data.companyInfo.website : `https://${data.companyInfo.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline truncate block"
                  >
                    {data.companyInfo.website.replace(/^https?:\/\//, '')}
                  </a>
                )}
                {data.companyInfo.businessOverview && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {data.companyInfo.businessOverview}
                  </p>
                )}
              </div>
            </div>
            <Link href="/app/profile" className="shrink-0">
              <Button variant="outline" size="sm">פרופיל עסקי</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Compact Stats Strip */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {kpiCards.map((stat) => {
          const Icon = stat.icon
          return (
            <Link key={stat.key} href={stat.href}>
              <Card className="transition-all hover:shadow-sm hover:border-primary/40">
                <CardContent className="flex flex-col items-center gap-1 p-2 sm:p-3 text-center">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${stat.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-lg font-bold leading-none">{stat.value}</span>
                  <span className="text-xs text-muted-foreground leading-tight">{stat.label}</span>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      {/* Weekly Actions */}
      <WeeklyActionsBlock />

      {/* Niche Discovery */}
      <NicheDiscoveryBlock />

      {/* Market Analysis */}
      <MarketAnalysisBlock />

      {/* AI exhaustion banner */}
      {bothExhausted && (
        <div className="flex items-center justify-between rounded-lg bg-red-50 border border-red-200 p-4">
          <span className="text-sm font-medium text-red-700">
            מכסת AI יומית מוצתה (Groq + Gemini) — ניתוחים חדשים יתאפשרו לאחר איפוס המכסה (24 שעות)
          </span>
          <Link href="/admin/usage" className="text-xs text-red-600 underline whitespace-nowrap mr-3">
            צפה בפרטים
          </Link>
        </div>
      )}

      {/* Smart Bottom Widgets */}
      {data && (
        data.competitorsCount === 0 && data.tendersCount === 0 && data.conferencesCount === 0 && data.trendsCount === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
                <BarChart3 className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">ברוכים הבאים ל-North Star Radar!</h3>
              <p className="text-muted-foreground max-w-md mb-4">
                המערכת שלך מוכנה לפעולה. הפעל סריקה ראשונה כדי להתחיל לקבל מודיעין עסקי.
              </p>
              {scanning ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">{scanProgress}</p>
                </div>
              ) : (
                <Button onClick={runFirstScan} size="lg">
                  <BarChart3 className="ml-2 h-5 w-5" />
                  הפעל סריקה ראשונה
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {data.upcomingTenders.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <FileText className="h-5 w-5 text-primary" />
                    מכרזים קרובים
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {data.upcomingTenders.map((tender, idx) => {
                      const days = getDaysUntil(tender.deadline)
                      return (
                        <div key={idx} className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                          <div>
                            <p className="text-sm font-medium">{tender.title}</p>
                            <p className="text-xs text-muted-foreground">{tender.organization}</p>
                          </div>
                          <Badge variant="outline" className={
                            days <= 14 ? "border-red-200 text-red-600" : "border-green-200 text-green-600"
                          }>
                            {days > 0 ? `${days} ימים` : "היום"}
                          </Badge>
                        </div>
                      )
                    })}
                  </div>
                  <Link href="/app/tenders" className="mt-4 flex items-center justify-center gap-1 text-sm text-primary hover:underline">
                    צפה בכל המכרזים
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </Link>
                </CardContent>
              </Card>
            )}

            {data.topCompetitors.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Target className="h-5 w-5 text-primary" />
                    מתחרים עיקריים
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {data.topCompetitors.map((comp, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{comp.name}</p>
                          {comp.services && <p className="text-xs text-muted-foreground line-clamp-1">{comp.services}</p>}
                        </div>
                        <Badge variant="outline" className={
                          comp.threat_score >= 70 ? "border-red-200 text-red-600" : "border-yellow-200 text-yellow-600"
                        }>
                          {comp.threat_score}
                        </Badge>
                      </div>
                    ))}
                  </div>
                  <Link href="/app/competitors" className="mt-4 flex items-center justify-center gap-1 text-sm text-primary hover:underline">
                    צפה בכל המתחרים
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </Link>
                </CardContent>
              </Card>
            )}

            {data.upcomingConferences.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Calendar className="h-5 w-5 text-primary" />
                    כנסים קרובים
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {data.upcomingConferences.map((conf, idx) => (
                      <div key={idx} className="rounded-lg bg-muted/50 p-3">
                        <p className="text-sm font-medium">{conf.name}</p>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          {conf.date && <span>{conf.date}</span>}
                          {conf.location && <span>· {conf.location}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                  <Link href="/app/conferences" className="mt-4 flex items-center justify-center gap-1 text-sm text-primary hover:underline">
                    צפה בכל הכנסים
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </Link>
                </CardContent>
              </Card>
            )}

            {data.topTrends.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Activity className="h-5 w-5 text-primary" />
                    טרנדים מובילים
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {data.topTrends.map((trend, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{trend.name}</p>
                          {trend.category && <p className="text-xs text-muted-foreground">{trend.category}</p>}
                        </div>
                        <Badge variant="outline" className={
                          (trend.direction === 'עולה' || trend.direction === 'up') ? "border-green-200 text-green-600" :
                          (trend.direction === 'יורד' || trend.direction === 'down') ? "border-red-200 text-red-600" :
                          "border-yellow-200 text-yellow-600"
                        }>
                          {(trend.direction === 'עולה' || trend.direction === 'up') ? 'עולה' :
                           (trend.direction === 'יורד' || trend.direction === 'down') ? 'יורד' : 'יציב'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                  <Link href="/app/trends" className="mt-4 flex items-center justify-center gap-1 text-sm text-primary hover:underline">
                    צפה בכל הטרנדים
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </Link>
                </CardContent>
              </Card>
            )}

            {data.upcomingTenders.length === 0 && data.topCompetitors.length === 0 &&
             data.upcomingConferences.length === 0 && data.topTrends.length === 0 && (
              <Card className="md:col-span-2">
                <CardContent className="flex items-center justify-center py-8 text-center">
                  <p className="text-muted-foreground text-sm">אין עדיין נתונים. לחץ רענן בכל מודול כדי להתחיל.</p>
                </CardContent>
              </Card>
            )}
          </div>
        )
      )}
    </div>
  )
}
