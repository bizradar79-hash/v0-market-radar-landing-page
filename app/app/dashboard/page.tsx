"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import Link from "next/link"
import {
  TrendingUp,
  Target,
  Users,
  FileText,
  BarChart3,
  Activity,
  Bell,
  ArrowLeft,
  Loader2,
  RefreshCw,
  Building2,
} from "lucide-react"

interface CompanyInfo {
  name: string
  industry: string
  city: string
}

interface DashboardData {
  leadsCount: number
  tendersCount: number
  competitorsCount: number
  trendsCount: number
  alertsCount: number
  topLeads: Array<{ name: string; score: number; industry: string }>
  upcomingTenders: Array<{ title: string; organization: string; deadline: string }>
  lastAnalyzed: string | null
  companyInfo: CompanyInfo | null
}

export default function AppDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState("")
  const [autoAnalyzing, setAutoAnalyzing] = useState(false)
  const [bothExhausted, setBothExhausted] = useState(false)
  const hasAutoAnalyzed = useRef(false)
  const supabase = createClient()
  const { toast } = useToast()

  useEffect(() => {
    fetchDashboardData()
    fetch('/api/usage-stats')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.bothExhausted) setBothExhausted(true) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!data || loading || scanning || autoAnalyzing || hasAutoAnalyzed.current) return

    const shouldAutoAnalyze = () => {
      if (data.leadsCount === 0 && data.competitorsCount === 0) return false
      if (!data.lastAnalyzed) return true
      const lastAnalyzed = new Date(data.lastAnalyzed)
      const now = new Date()
      const diffHours = (now.getTime() - lastAnalyzed.getTime()) / (1000 * 60 * 60)
      return diffHours >= 24
    }

    if (shouldAutoAnalyze()) {
      hasAutoAnalyzed.current = true
      runAutoAnalysis()
    }
  }, [data, loading])

  async function fetchDashboardData() {
    const [
      { count: leadsCount },
      { count: tendersCount },
      { count: competitorsCount },
      { count: trendsCount },
      { count: alertsCount },
      { data: topLeads },
      { data: upcomingTenders },
      { data: companyData },
    ] = await Promise.all([
      supabase.from("leads").select("*", { count: "exact", head: true }),
      supabase.from("tenders").select("*", { count: "exact", head: true }),
      supabase.from("competitors").select("*", { count: "exact", head: true }),
      supabase.from("trends").select("*", { count: "exact", head: true }),
      supabase.from("alerts").select("*", { count: "exact", head: true }).eq("is_read", false),
      supabase.from("leads").select("name, score, industry").order("score", { ascending: false }).limit(3),
      supabase.from("tenders").select("title, organization, deadline").order("deadline", { ascending: true }).limit(3),
      supabase.from("companies").select("name, industry, city, last_analyzed").single(),
    ])

    setData({
      leadsCount: leadsCount || 0,
      tendersCount: tendersCount || 0,
      competitorsCount: competitorsCount || 0,
      trendsCount: trendsCount || 0,
      alertsCount: alertsCount || 0,
      topLeads: topLeads || [],
      upcomingTenders: upcomingTenders || [],
      lastAnalyzed: companyData?.last_analyzed || null,
      companyInfo: companyData ? {
        name: companyData.name || '',
        industry: companyData.industry || '',
        city: companyData.city || '',
      } : null,
    })
    setLoading(false)
  }

  async function runAutoAnalysis() {
    setAutoAnalyzing(true)
    const results = { competitors: 0, leads: 0, tenders: 0, trends: 0, news: 0, conferences: 0 }

    const steps = [
      { api: '/api/find-competitors', label: 'מחפש מתחרים...', key: 'competitors' },
      { api: '/api/generate-leads', label: 'מגלה לידים...', key: 'leads' },
      { api: '/api/generate-tenders', label: 'סורק מכרזים...', key: 'tenders' },
      { api: '/api/generate-trends', label: 'מנתח טרנדים...', key: 'trends' },
      { api: '/api/generate-news', label: 'אוסף חדשות...', key: 'news' },
      { api: '/api/generate-conferences', label: 'מחפש כנסים...', key: 'conferences' },
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

      if ((window as typeof window & { refreshSidebarCounts?: () => void }).refreshSidebarCounts) {
        (window as typeof window & { refreshSidebarCounts?: () => void }).refreshSidebarCounts()
      }

      toast({
        title: "הניתוח הושלם בהצלחה!",
        description: `נמצאו ${results.leads} לידים ו-${results.tenders} מכרזים`,
      })
    } catch (error) {
      console.error("Error in auto analysis:", error)
      toast({
        title: "שגיאה בניתוח",
        description: "חלק מהנתונים לא נטענו כראוי",
        variant: "destructive",
      })
    } finally {
      setAutoAnalyzing(false)
      setScanProgress("")
    }
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

      if ((window as typeof window & { refreshSidebarCounts?: () => void }).refreshSidebarCounts) {
        (window as typeof window & { refreshSidebarCounts?: () => void }).refreshSidebarCounts()
      }

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
    { key: "leads", label: "לידים", icon: Users, href: "/app/leads", value: data?.leadsCount || 0 },
    { key: "tenders", label: "מכרזים", icon: FileText, href: "/app/tenders", value: data?.tendersCount || 0 },
    { key: "competitors", label: "מתחרים", icon: Target, href: "/app/competitors", value: data?.competitorsCount || 0 },
    { key: "trends", label: "טרנדים", icon: Activity, href: "/app/trends", value: data?.trendsCount || 0 },
    { key: "alerts", label: "התראות חדשות", icon: Bell, href: "/app/alerts", value: data?.alertsCount || 0 },
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

      {/* Auto-analyzing banner */}
      {autoAnalyzing && (
        <div className="flex items-center justify-center gap-3 rounded-lg bg-primary/10 border border-primary/20 p-4">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm font-medium text-primary">
            {scanProgress || "מנתח את השוק עבורך..."}
          </span>
        </div>
      )}

      {/* Profile Summary Card */}
      {data?.companyInfo && (
        <Card className="border-primary/20">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground">{data.companyInfo.name}</p>
                <p className="text-sm text-muted-foreground">
                  {data.companyInfo.industry}
                  {data.companyInfo.city ? ` · ${data.companyInfo.city}` : ''}
                </p>
              </div>
            </div>
            <Link href="/app/profile">
              <Button variant="outline" size="sm">ערוך פרופיל</Button>
            </Link>
          </CardContent>
        </Card>
      )}

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
          {(data?.leadsCount || 0) > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={runFirstScan}
              disabled={scanning || autoAnalyzing}
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

      {/* KPI Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kpiCards.map((stat) => {
          const Icon = stat.icon
          return (
            <Link key={stat.key} href={stat.href}>
              <Card className="transition-all hover:shadow-md hover:border-primary/50">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    {stat.value > 0 && (
                      <div className="flex items-center gap-1 text-sm text-green-600">
                        <TrendingUp className="h-4 w-4" />
                        <span>חדש</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-3">
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="text-2xl font-bold">{stat.value}</span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center text-xs text-muted-foreground">
                    <span>צפה בפרטים</span>
                    <ArrowLeft className="mr-1 h-3 w-3" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      {/* Empty State or Data Sections */}
      {data && (data.leadsCount === 0 && data.competitorsCount === 0) ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
              <BarChart3 className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">ברוכים הבאים ל-Market Radar!</h3>
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
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5 text-primary" />
                לידים מובילים
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data?.topLeads && data.topLeads.length > 0 ? (
                <div className="space-y-3">
                  {data.topLeads.map((lead, idx) => (
                    <div key={idx} className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/10 text-sm font-bold text-primary">
                          {lead.score || 0}
                        </div>
                        <div>
                          <span className="text-sm font-medium">{lead.name}</span>
                          {lead.industry && <p className="text-xs text-muted-foreground">{lead.industry}</p>}
                        </div>
                      </div>
                      <Badge variant="outline" className={
                        (lead.score || 0) >= 80
                          ? "border-green-200 text-green-600"
                          : "border-yellow-200 text-yellow-600"
                      }>
                        {(lead.score || 0) >= 80 ? "חם" : "בינוני"}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-sm text-muted-foreground py-4">אין לידים עדיין</p>
              )}
              <Link href="/app/leads" className="mt-4 flex items-center justify-center gap-1 text-sm text-primary hover:underline">
                צפה בכל הלידים
                <ArrowLeft className="h-3.5 w-3.5" />
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5 text-primary" />
                מכרזים קרובים
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data?.upcomingTenders && data.upcomingTenders.length > 0 ? (
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
                          days <= 14
                            ? "border-red-200 text-red-600"
                            : "border-green-200 text-green-600"
                        }>
                          {days > 0 ? `${days} ימים` : "היום"}
                        </Badge>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-center text-sm text-muted-foreground py-4">אין מכרזים עדיין</p>
              )}
              <Link href="/app/tenders" className="mt-4 flex items-center justify-center gap-1 text-sm text-primary hover:underline">
                צפה בכל המכרזים
                <ArrowLeft className="h-3.5 w-3.5" />
              </Link>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
