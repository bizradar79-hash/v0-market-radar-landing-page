"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import Link from "next/link"
import { 
  TrendingUp,
  Lightbulb,
  Target,
  Users,
  FileText,
  BarChart3,
  Activity,
  Bell,
  ArrowLeft,
  Loader2,
} from "lucide-react"

interface DashboardData {
  opportunitiesCount: number
  leadsCount: number
  tendersCount: number
  competitorsCount: number
  trendsCount: number
  alertsCount: number
  topOpportunities: Array<{ title: string; impact_score: number; priority: string }>
  upcomingTenders: Array<{ title: string; organization: string; deadline: string }>
}

export default function AppDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    fetchDashboardData()
  }, [])

  async function fetchDashboardData() {
    // Fetch counts from all tables - RLS will filter to current user
    const [
      { count: opportunitiesCount },
      { count: leadsCount },
      { count: tendersCount },
      { count: competitorsCount },
      { count: trendsCount },
      { count: alertsCount },
      { data: topOpps },
      { data: upcomingTenders },
    ] = await Promise.all([
      supabase.from("opportunities").select("*", { count: "exact", head: true }),
      supabase.from("leads").select("*", { count: "exact", head: true }),
      supabase.from("tenders").select("*", { count: "exact", head: true }),
      supabase.from("competitors").select("*", { count: "exact", head: true }),
      supabase.from("trends").select("*", { count: "exact", head: true }),
      supabase.from("alerts").select("*", { count: "exact", head: true }).eq("is_read", false),
      supabase.from("opportunities").select("title, impact_score, priority").order("impact_score", { ascending: false }).limit(3),
      supabase.from("tenders").select("title, organization, deadline").order("deadline", { ascending: true }).limit(3),
    ])

    setData({
      opportunitiesCount: opportunitiesCount || 0,
      leadsCount: leadsCount || 0,
      tendersCount: tendersCount || 0,
      competitorsCount: competitorsCount || 0,
      trendsCount: trendsCount || 0,
      alertsCount: alertsCount || 0,
      topOpportunities: topOpps || [],
      upcomingTenders: upcomingTenders || [],
    })
    setLoading(false)
  }

  const kpiCards = [
    { key: "opportunities", label: "הזדמנויות", icon: Lightbulb, href: "/app/opportunities", value: data?.opportunitiesCount || 0 },
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
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">דשבורד</h1>
        <p className="text-muted-foreground">סקירה כללית של הפעילות העסקית שלך</p>
      </div>

      {/* KPI Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kpiCards.map((stat) => {
          const Icon = stat.icon
          return (
            <Link key={stat.key} href={stat.href}>
              <Card className="border-border bg-card transition-all hover:border-primary/50 hover:bg-card/80">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    {stat.value > 0 && (
                      <div className="flex items-center gap-1 text-sm text-green-400">
                        <TrendingUp className="h-4 w-4" />
                        <span>חדש</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-3">
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-foreground">{stat.value}</span>
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
      {data && (data.opportunitiesCount === 0 && data.leadsCount === 0) ? (
        <Card className="border-border bg-card">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
              <BarChart3 className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">ברוכים הבאים ל-Market Radar!</h3>
            <p className="text-muted-foreground max-w-md mb-4">
              המערכת שלך מוכנה לפעולה. כדי להתחיל לקבל מודיעין עסקי, 
              ודא שהגדרות החברה שלך מעודכנות בדף ההגדרות.
            </p>
            <Link 
              href="/app/settings" 
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              עבור להגדרות
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Lightbulb className="h-5 w-5 text-primary" />
                הזדמנויות מובילות
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data?.topOpportunities && data.topOpportunities.length > 0 ? (
                <div className="space-y-3">
                  {data.topOpportunities.map((opp, idx) => (
                    <div key={idx} className="flex items-center justify-between rounded-lg bg-secondary/30 p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/10 text-sm font-bold text-primary">
                          {opp.impact_score || 0}
                        </div>
                        <span className="text-sm font-medium text-foreground">{opp.title}</span>
                      </div>
                      <Badge variant="outline" className={
                        opp.priority === "גבוהה" || opp.priority === "דחופה"
                          ? "border-orange-500/30 text-orange-400" 
                          : "border-yellow-500/30 text-yellow-400"
                      }>
                        {opp.priority || "בינונית"}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-sm text-muted-foreground py-4">אין הזדמנויות עדיין</p>
              )}
              <Link href="/app/opportunities" className="mt-4 flex items-center justify-center gap-1 text-sm text-primary hover:underline">
                צפה בכל ההזדמנויות
                <ArrowLeft className="h-3.5 w-3.5" />
              </Link>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
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
                      <div key={idx} className="flex items-center justify-between rounded-lg bg-secondary/30 p-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{tender.title}</p>
                          <p className="text-xs text-muted-foreground">{tender.organization}</p>
                        </div>
                        <Badge variant="outline" className={
                          days <= 14 
                            ? "border-red-500/30 text-red-400" 
                            : "border-green-500/30 text-green-400"
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
