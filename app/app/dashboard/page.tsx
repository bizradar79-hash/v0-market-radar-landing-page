"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import Link from "next/link"
import { 
  TrendingUp,
  TrendingDown,
  Lightbulb,
  Target,
  Users,
  FileText,
  BarChart3,
  Activity,
  ArrowLeft,
  Loader2,
} from "lucide-react"

interface KPIStat {
  stat_name: string
  stat_value: number
  stat_max: number | null
  change_percent: number
  change_direction: string
}

export default function AppDashboardPage() {
  const [stats, setStats] = useState<KPIStat[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    fetchStats()
  }, [])

  async function fetchStats() {
    const { data, error } = await supabase
      .from("kpi_stats")
      .select("*")

    if (!error && data) {
      setStats(data)
    }
    setLoading(false)
  }

  const getStatConfig = (statName: string) => {
    const configs: Record<string, { label: string; icon: React.ElementType; href: string }> = {
      opportunity_score: { label: "ציון הזדמנות", icon: BarChart3, href: "/app/opportunities" },
      new_opportunities: { label: "הזדמנויות חדשות", icon: Lightbulb, href: "/app/opportunities" },
      competitor_changes: { label: "פעילות מתחרים", icon: Target, href: "/app/competitors" },
      tender_alerts: { label: "התראות מכרז", icon: FileText, href: "/app/tenders" },
      new_leads: { label: "לידים חדשים", icon: Users, href: "/app/leads" },
      identified_trends: { label: "טרנדים מזוהים", icon: Activity, href: "/app/trends" },
    }
    return configs[statName] || { label: statName, icon: BarChart3, href: "/app/dashboard" }
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
        {stats.map((stat) => {
          const config = getStatConfig(stat.stat_name)
          const Icon = config.icon
          const isUp = stat.change_direction === "up"
          const isScore = stat.stat_max !== null

          return (
            <Link key={stat.stat_name} href={config.href}>
              <Card className="border-border bg-card transition-all hover:border-primary/50 hover:bg-card/80">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className={`flex items-center gap-1 text-sm ${isUp ? "text-green-400" : "text-red-400"}`}>
                      {isUp ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                      <span>{Math.abs(stat.change_percent)}%</span>
                    </div>
                  </div>
                  <div className="mt-3">
                    <p className="text-sm text-muted-foreground">{config.label}</p>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-foreground">{stat.stat_value}</span>
                      {isScore && (
                        <span className="text-sm text-muted-foreground">/ {stat.stat_max}</span>
                      )}
                    </div>
                    {isScore && (
                      <Progress value={(stat.stat_value / (stat.stat_max || 100)) * 100} className="mt-2 h-1.5" />
                    )}
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

      {/* Quick Links */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Lightbulb className="h-5 w-5 text-primary" />
              הזדמנויות מובילות
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { title: "הזדמנות בשוק הפינטק", score: 85, priority: "גבוהה" },
                { title: "שותפות אסטרטגית", score: 78, priority: "גבוהה" },
                { title: "מגזר הבריאות", score: 72, priority: "בינונית" },
              ].map((opp, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-lg bg-secondary/30 p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/10 text-sm font-bold text-primary">
                      {opp.score}
                    </div>
                    <span className="text-sm font-medium text-foreground">{opp.title}</span>
                  </div>
                  <Badge variant="outline" className={
                    opp.priority === "גבוהה" 
                      ? "border-orange-500/30 text-orange-400" 
                      : "border-yellow-500/30 text-yellow-400"
                  }>
                    {opp.priority}
                  </Badge>
                </div>
              ))}
            </div>
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
            <div className="space-y-3">
              {[
                { title: "מכרז מערכת ניהול מידע", org: "משרד הבריאות", days: 14 },
                { title: "פיתוח פלטפורמת AI", org: "רשות החדשנות", days: 30 },
                { title: "שירותי ענן וסייבר", org: "בנק ישראל", days: 21 },
              ].map((tender, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-lg bg-secondary/30 p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{tender.title}</p>
                    <p className="text-xs text-muted-foreground">{tender.org}</p>
                  </div>
                  <Badge variant="outline" className={
                    tender.days <= 14 
                      ? "border-red-500/30 text-red-400" 
                      : "border-green-500/30 text-green-400"
                  }>
                    {tender.days} ימים
                  </Badge>
                </div>
              ))}
            </div>
            <Link href="/app/tenders" className="mt-4 flex items-center justify-center gap-1 text-sm text-primary hover:underline">
              צפה בכל המכרזים
              <ArrowLeft className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
