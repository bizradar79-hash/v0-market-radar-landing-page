"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import {
  Target,
  FileText,
  BarChart3,
  Activity,
  ArrowLeft,
  Loader2,
  Building2,
  Calendar,
  Newspaper,
  Search,
  Globe,
  Share2,
  CheckSquare,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react"

interface CompanyInfo {
  name: string
  industry: string
  city: string
  website: string
  businessOverview: string
  geographicScope: string[]
}

interface SeoGeoSummary {
  bestSeoPosition: number | null
  bestGeoPosition: number | null
  seoQuery: string
  geoEngine: string
}

interface DashboardData {
  channelsCount: number
  tendersCount: number
  competitorsCount: number
  trendsCount: number
  conferencesCount: number
  newsCount: number
  topCompetitors: Array<{ name: string; threat_score: number; services: string }>
  upcomingTenders: Array<{ title: string; organization: string; deadline: string }>
  upcomingConferences: Array<{ name: string; date: string; location: string }>
  topTrends: Array<{ name: string; direction: string; category: string; score: number }>
  recentNews: Array<{ title: string; source: string; published_at: string; url: string }>
  topChannels: string[]
  weeklyActions: Array<{ id: string; title: string; category: string; priority: string }>
  competitorTrendItems: Array<{ competitor_name: string; keyword: string }>
  lastAnalyzed: string | null
  companyInfo: CompanyInfo | null
  seoGeo: SeoGeoSummary | null
  channelsLabel: string
}

export default function AppDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncDates, setSyncDates] = useState<{ last_sync_at: string | null; next_sync_at: string | null } | null>(null)
  const supabase = createClient()

  useEffect(() => {
    fetchDashboardData()
  }, [])

  async function fetchDashboardData() {
    const today = new Date().toISOString().split('T')[0]

    // Get user id first — used for explicit company_id filters on all queries
    const { data: { user } } = await supabase.auth.getUser()
    const userId = user?.id

    if (!userId) { setLoading(false); return }

    const [
      { count: tendersCount },
      { count: competitorsCount },
      { count: trendsCount },
      { count: conferencesCount },
      { count: newsCount },
      { data: topCompetitors },
      { data: upcomingTendersRaw },
      { data: upcomingConferences },
      { data: topTrendsRows },
      { data: recentNewsRows },
      { data: companyData },
      { data: dcTableRows },
      { data: compWithTrends },
    ] = await Promise.all([
      supabase.from("tenders").select("*", { count: "exact", head: true }).eq("company_id", userId),
      supabase.from("competitors").select("*", { count: "exact", head: true }).eq("company_id", userId),
      supabase.from("trends").select("*", { count: "exact", head: true }).eq("company_id", userId),
      supabase.from("conferences").select("*", { count: "exact", head: true }).eq("company_id", userId),
      supabase.from("news").select("*", { count: "exact", head: true }).eq("company_id", userId),
      supabase.from("competitors").select("name, threat_score, services").eq("company_id", userId).order("threat_score", { ascending: false }).limit(3),
      // Tenders: show any stored tenders — no deadline filter (null deadlines still shown)
      supabase.from("tenders").select("id, title, organization, deadline, link").eq("company_id", userId).order("deadline", { ascending: true }).limit(3),
      supabase.from("conferences").select("name, date, location").eq("company_id", userId).gte("date", today).order("date", { ascending: true }).limit(3),
      supabase.from("trends").select("name, score, direction, category").eq("company_id", userId).order("score", { ascending: false }).limit(5),
      supabase.from("news").select("title, source, published_at, url").eq("company_id", userId).order("published_at", { ascending: false }).limit(3),
      supabase.from("companies").select(
        "name, industry, city, website, last_analyzed, business_overview, geographic_scope, seo_ranking, geo_ranking, last_sync_at, next_sync_at, weekly_actions, industry_trends, competitor_trends, distribution_channels, niche_opportunities, business_profile"
      ).eq("id", userId).single(),
      // Distribution channels table (may not exist — errors silently return null data)
      supabase.from("distribution_channels").select("name, channel_type, description, potential_score").eq("company_id", userId).eq("status", "potential").order("potential_score", { ascending: false }).limit(3),
      // Competitors with trends_analysis column
      supabase.from("competitors").select("name, trends_analysis").eq("company_id", userId).not("trends_analysis", "is", null).limit(5),
    ])

    // ── Debug — readable from browser console via window.__dashDebug ──────────
    console.log('[dashboard] data loaded — inspect window.__dashDebug')

    // ── SEO / GEO extraction — handles multiple possible structures ──────────
    let seoGeo: SeoGeoSummary | null = null
    if (companyData) {
      const seoData = (companyData as any).seo_ranking as any
      const geoData = (companyData as any).geo_ranking as any

      let bestSeoPosition: number | null = null
      let seoQuery = ''
      // Structure A: { queryVariants: [{ query, position }] }
      if (seoData?.queryVariants?.length) {
        for (const v of seoData.queryVariants) {
          if (v.position != null && (bestSeoPosition === null || v.position < bestSeoPosition)) {
            bestSeoPosition = v.position; seoQuery = v.query || ''
          }
        }
      }
      // Structure B: { queries: [{ query, position }] }
      if (!bestSeoPosition && seoData?.queries?.length) {
        for (const v of seoData.queries) {
          if (v.position != null && (bestSeoPosition === null || v.position < bestSeoPosition)) {
            bestSeoPosition = v.position; seoQuery = v.query || v.keyword || ''
          }
        }
      }
      // Structure C: { position, query }
      if (!bestSeoPosition && seoData?.position != null) {
        bestSeoPosition = seoData.position; seoQuery = seoData.query || ''
      }
      // Structure D: { rankings: [{ query, rank/position }] }
      if (!bestSeoPosition && seoData?.rankings?.length) {
        for (const v of seoData.rankings) {
          const pos = v.position ?? v.rank
          if (pos != null && (bestSeoPosition === null || pos < bestSeoPosition)) {
            bestSeoPosition = pos; seoQuery = v.query || v.keyword || ''
          }
        }
      }

      let bestGeoPosition: number | null = null
      let geoEngine = ''
      // Structure A: { engines: [{ engine/name, position/rank }] }
      if (geoData?.engines?.length) {
        for (const e of geoData.engines) {
          const pos = e.position ?? e.rank
          if (pos != null && (bestGeoPosition === null || pos < bestGeoPosition)) {
            bestGeoPosition = pos; geoEngine = e.engine || e.name || ''
          }
        }
      }
      // Structure B: { results: [{ engine, position }] }
      if (!bestGeoPosition && geoData?.results?.length) {
        for (const e of geoData.results) {
          const pos = e.position ?? e.rank
          if (pos != null && (bestGeoPosition === null || pos < bestGeoPosition)) {
            bestGeoPosition = pos; geoEngine = e.engine || e.name || ''
          }
        }
      }
      // Structure C: { position, engine }
      if (!bestGeoPosition && geoData?.position != null) {
        bestGeoPosition = geoData.position; geoEngine = geoData.engine || ''
      }

      if (bestSeoPosition !== null || bestGeoPosition !== null) {
        seoGeo = { bestSeoPosition, bestGeoPosition, seoQuery, geoEngine }
      }
    }

    // ── Distribution channels ────────────────────────────────────────────────
    // Priority 1: distribution_channels TABLE (status=potential)
    // Priority 2: niche_opportunities JSONB
    // ── Distribution channels — use niche_opportunities.opportunities as potential niches ──
    const bp = (companyData as any)?.business_profile as any
    const dcRaw = (companyData as any)?.distribution_channels
    const nicheRaw = (companyData as any)?.niche_opportunities as any
    const existingChannels: string[] = bp?.distributionChannels || bp?.distribution_channels || []

    let potentialChannels: string[] = []
    let channelsLabel = 'הזדמנויות נישה מובילות'

    // Priority 1: niche_opportunities.opportunities sorted by opportunityScore
    const nicheOpps: any[] = nicheRaw?.opportunities || []
    if (nicheOpps.length > 0) {
      potentialChannels = [...nicheOpps]
        .sort((a, b) => (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0))
        .slice(0, 3)
        .map((o: any) => o.nicheTitle || o.title || o.name || String(o))
    }

    // Priority 2: distribution_channels table rows
    if (potentialChannels.length === 0 && Array.isArray(dcTableRows) && dcTableRows.length > 0) {
      potentialChannels = dcTableRows.map((r: any) => r.name || r.channel_type || String(r))
      channelsLabel = 'ערוצי הפצה פוטנציאליים'
    }

    // Priority 3: distribution_channels JSONB column (objects with status=potential)
    if (potentialChannels.length === 0 && Array.isArray(dcRaw)) {
      const potentialObjs = dcRaw.filter((c: any) =>
        typeof c === 'object' && (c.status === 'potential' || c.type === 'potential')
      )
      if (potentialObjs.length > 0) {
        potentialChannels = potentialObjs.map((c: any) => c.name || c.channel || String(c))
        channelsLabel = 'ערוצי הפצה פוטנציאליים'
      } else {
        const allStrings = dcRaw.filter((c: any) => typeof c === 'string') as string[]
        const existingSet = new Set(existingChannels.map((s: string) => s.toLowerCase()))
        potentialChannels = allStrings.filter(c => !existingSet.has(c.toLowerCase()))
        if (potentialChannels.length === 0) { potentialChannels = allStrings }
        channelsLabel = 'ערוצי הפצה קיימים'
      }
    }

    // Priority 4: business_profile existing channels
    if (potentialChannels.length === 0 && existingChannels.length > 0) {
      potentialChannels = existingChannels
      channelsLabel = 'ערוצי הפצה קיימים'
    }

    const topChannels = potentialChannels.slice(0, 3)

    // ── Weekly actions — high priority first ─────────────────────────────────
    const weeklyActionsRaw = ((companyData as any)?.weekly_actions as { actions?: any[] } | null)?.actions || []
    const isHighPriority = (a: any) =>
      a.priority === 'גבוהה' || a.priority === 'high' ||
      a.urgency === 'high' || a.urgency === 'גבוהה' ||
      String(a.title || '').startsWith('דחוף') || String(a.title || '').startsWith('חשוב')
    const highPriority = weeklyActionsRaw.filter(isHighPriority)
    const weeklyActions = (highPriority.length > 0 ? highPriority : weeklyActionsRaw)
      .slice(0, 3)
      .map((a: any) => ({ id: a.id || '', title: a.title || '', category: a.category || '', priority: a.priority || '' }))

    // ── Competitor trend items — read from company.competitor_trends JSONB ────
    const competitorTrendItems: Array<{ competitor_name: string; keyword: string }> = []
    const compTrendsData = (companyData as any)?.competitor_trends as any
    const compEntries: any[] =
      compTrendsData?.competitor_data ||
      compTrendsData?.competitors ||
      (Array.isArray(compTrendsData) ? compTrendsData : [])
    for (const entry of compEntries.slice(0, 3)) {
      const name = entry.competitor_name || entry.name || ''
      const topKw =
        entry.trends?.[0]?.keyword ||
        entry.trends?.[0]?.name ||
        entry.keywords?.[0] ||
        entry.keyword ||
        ''
      if (name && topKw) competitorTrendItems.push({ competitor_name: name, keyword: topKw })
    }

    // ── Debug window object — window.__dashDebug in browser console ───────────
    if (typeof window !== 'undefined') {
      ;(window as any).__dashDebug = {
        tenders: upcomingTendersRaw,
        niche: nicheRaw,
        nicheOpps: nicheOpps.slice(0, 5),
        competitorTrends: compTrendsData,
        compEntries: compEntries.slice(0, 3),
        dc: potentialChannels,
        dcTableRows,
        industry_trends: (companyData as any)?.industry_trends,
        seo_ranking: (companyData as any)?.seo_ranking,
        geo_ranking: (companyData as any)?.geo_ranking,
        weekly_actions: (companyData as any)?.weekly_actions,
      }
    }

    // ── Hot trends — trends table first, fallback to industry_trends JSONB ───
    let topTrends = (topTrendsRows || []).map((t: any) => ({
      name: t.name || '',
      direction: t.direction || 'stable',
      category: t.category || '',
      score: t.score ?? 0,
    }))

    if (topTrends.length === 0) {
      // Fallback: read from industry_trends JSONB on companies row
      const itRaw = (companyData as any)?.industry_trends as any
      // Handle: { trends: [{ keyword/name, direction, score }] }
      // or:     [{ keyword, direction, score }]
      const itArr: any[] = itRaw?.trends || itRaw?.items || (Array.isArray(itRaw) ? itRaw : [])
      topTrends = itArr.slice(0, 5).map((t: any) => ({
        name: t.keyword || t.name || '',
        direction: t.direction || t.trend || 'stable',
        category: t.category || '',
        score: t.score ?? t.trend_score ?? 0,
      })).filter(t => t.name)
      if (topTrends.length > 0) console.log('[dashboard] topTrends from industry_trends JSONB:', topTrends.length)
    }

    // Normalize tenders: map organization/publisher field
    const upcomingTenders = (upcomingTendersRaw || []).map((t: any) => ({
      title: t.title || '',
      organization: t.organization || t.publisher || '',
      deadline: t.deadline || '',
    }))

    setData({
      channelsCount: topChannels.length,
      tendersCount: tendersCount || 0,
      competitorsCount: competitorsCount || 0,
      trendsCount: trendsCount || 0,
      conferencesCount: conferencesCount || 0,
      newsCount: newsCount || 0,
      topCompetitors: topCompetitors || [],
      upcomingTenders,
      upcomingConferences: upcomingConferences || [],
      topTrends,
      recentNews: recentNewsRows || [],
      topChannels,
      weeklyActions,
      competitorTrendItems,
      lastAnalyzed: companyData?.last_analyzed || null,
      seoGeo,
      channelsLabel,
      companyInfo: companyData ? {
        name: companyData.name || '',
        industry: companyData.industry || '',
        city: companyData.city || '',
        website: companyData.website || '',
        businessOverview: companyData.business_overview || '',
        geographicScope: Array.isArray(companyData.geographic_scope)
          ? companyData.geographic_scope
          : [companyData.geographic_scope || 'national'],
      } : null,
    })
    if (companyData) setSyncDates({ last_sync_at: (companyData as any).last_sync_at ?? null, next_sync_at: (companyData as any).next_sync_at ?? null })
    console.log('[dashboard] result — topTrends:', topTrends.length, 'competitorTrends:', competitorTrendItems.length, 'weeklyActions:', weeklyActions.length, 'topChannels:', topChannels.length, 'channelsLabel:', channelsLabel, 'seoGeo:', !!seoGeo)
    setLoading(false)
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

  function getDaysUntil(deadline: string): number {
    const diff = new Date(deadline).getTime() - new Date().getTime()
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
  }

  function DirectionIcon({ direction }: { direction: string }) {
    const up = direction === 'rising' || direction === 'עולה' || direction === 'up'
    const down = direction === 'declining' || direction === 'יורד' || direction === 'down'
    if (up) return <TrendingUp className="h-3.5 w-3.5 text-green-600" />
    if (down) return <TrendingDown className="h-3.5 w-3.5 text-red-600" />
    return <Minus className="h-3.5 w-3.5 text-yellow-600" />
  }

  function directionLabel(direction: string) {
    if (direction === 'rising' || direction === 'up') return 'עולה'
    if (direction === 'declining' || direction === 'down') return 'יורד'
    if (direction === 'עולה' || direction === 'יורד' || direction === 'יציב') return direction
    return 'יציב'
  }

  function directionClass(direction: string) {
    const up = direction === 'rising' || direction === 'עולה' || direction === 'up'
    const down = direction === 'declining' || direction === 'יורד' || direction === 'down'
    if (up) return "border-green-200 text-green-600"
    if (down) return "border-red-200 text-red-600"
    return "border-yellow-200 text-yellow-600"
  }

  const kpiCards = [
    { key: "channels", label: "ערוצי הפצה", icon: Share2, href: "/app/distribution-channels", value: data?.channelsCount || 0, color: "bg-teal-100 text-teal-700" },
    { key: "tenders", label: "מכרזים", icon: FileText, href: "/app/tenders", value: data?.tendersCount || 0, color: "bg-purple-100 text-purple-700" },
    { key: "competitors", label: "מתחרים", icon: Target, href: "/app/competitors", value: data?.competitorsCount || 0, color: "bg-red-100 text-red-700" },
    { key: "trends", label: "טרנדים", icon: Activity, href: "/app/trends", value: data?.trendsCount || 0, color: "bg-blue-100 text-blue-700" },
    { key: "conferences", label: "כנסים", icon: Calendar, href: "/app/conferences", value: data?.conferencesCount || 0, color: "bg-indigo-100 text-indigo-700" },
    { key: "news", label: "חדשות", icon: Newspaper, href: "/app/news", value: data?.newsCount || 0, color: "bg-slate-100 text-slate-700" },
  ]

  function GroupHeader({ color, label }: { color: string; label: string }) {
    return (
      <div className="flex items-center gap-2 mb-4">
        <div className={`w-1 h-6 rounded-full ${color}`} />
        <h2 className="text-lg font-semibold">{label}</h2>
      </div>
    )
  }

  const hasAnyData = data && (
    data.tendersCount > 0 || data.competitorsCount > 0 ||
    data.conferencesCount > 0 || data.trendsCount > 0 ||
    data.newsCount > 0 || data.channelsCount > 0
  )

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
        {syncDates && (
          <p className="text-xs text-muted-foreground">
            עודכן: {syncDates.last_sync_at ? new Date(syncDates.last_sync_at).toLocaleDateString('he-IL') : '—'} | עדכון הבא: {syncDates.next_sync_at ? new Date(syncDates.next_sync_at).toLocaleDateString('he-IL') : '—'}
          </p>
        )}
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
                  {data.companyInfo.geographicScope.map(scope => (
                    <Link key={scope} href="/app/settings">
                      <Badge className={`text-xs px-1.5 py-0 cursor-pointer hover:opacity-80 ${
                        scope === 'international' ? 'bg-teal-100 text-teal-700' :
                        scope === 'national' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {scope === 'international' ? '🌍 בינלאומי' :
                         scope === 'national' ? '🇮🇱 ארצי' : '🏙️ מקומי'}
                      </Badge>
                    </Link>
                  ))}
                </div>
                {data.companyInfo.website && (
                  <a
                    href={data.companyInfo.website.startsWith('http') ? data.companyInfo.website : `https://${data.companyInfo.website}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline truncate block"
                  >
                    {data.companyInfo.website.replace(/^https?:\/\//, '')}
                  </a>
                )}
                {data.companyInfo.businessOverview && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{data.companyInfo.businessOverview}</p>
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

      {/* Empty state */}
      {!hasAnyData ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
              <BarChart3 className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">ברוכים הבאים ל-North Star Radar!</h3>
            <p className="text-muted-foreground max-w-md mb-4">
              המערכת שלך מוכנה לפעולה. הנתונים יתעדכנו אוטומטית בסנכרון הראשון.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">

          {/* ═══════════════════════════════════════════════════════ */}
          {/* GROUP 1 — מנוע צמיחה                                  */}
          {/* ═══════════════════════════════════════════════════════ */}
          <section>
            <GroupHeader color="bg-teal-500" label="מנוע צמיחה" />
            <div className="grid gap-4 md:grid-cols-2">
              {/* ערוצי הפצה */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Share2 className="h-4 w-4 text-teal-600" />
                    {data!.channelsLabel}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data!.topChannels.length > 0 ? (
                    <div className="space-y-2">
                      {data!.topChannels.map((ch, i) => (
                        <div key={i} className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700 text-xs font-bold">
                            {i + 1}
                          </div>
                          <span className="text-sm font-medium truncate">{ch}</span>
                        </div>
                      ))}
                      <Link href="/app/distribution-channels" className="mt-3 flex items-center justify-center gap-1 text-sm text-primary hover:underline">
                        כל ערוצי ההפצה
                        <ArrowLeft className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  ) : (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      <p>לא הוגדרו ערוצי הפצה</p>
                      <Link href="/app/profile" className="text-primary text-xs hover:underline">הגדר בפרופיל →</Link>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* מה לעשות השבוע */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CheckSquare className="h-4 w-4 text-teal-600" />
                    מה לעשות השבוע
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data!.weeklyActions.length > 0 ? (
                    <div className="space-y-2">
                      {data!.weeklyActions.map((action, i) => (
                        <div key={i} className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2">
                          <div className="mt-0.5 flex h-4 w-4 shrink-0 rounded border-2 border-teal-400" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium line-clamp-2">{action.title}</p>
                            {action.category && (
                              <span className="text-xs text-muted-foreground">{action.category}</span>
                            )}
                          </div>
                        </div>
                      ))}
                      <Link href="/app/opportunities" className="mt-3 flex items-center justify-center gap-1 text-sm text-primary hover:underline">
                        כל ההמלצות
                        <ArrowLeft className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  ) : (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      <p>אין פעולות בעדיפות גבוהה השבוע</p>
                      <Link href="/app/opportunities" className="text-primary text-xs hover:underline">צפה בהזדמנויות →</Link>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </section>

          {/* ═══════════════════════════════════════════════════════ */}
          {/* GROUP 2 — מודיעין שוק                                  */}
          {/* ═══════════════════════════════════════════════════════ */}
          <section>
            <GroupHeader color="bg-blue-500" label="מודיעין שוק" />
            <div className="grid gap-4 md:grid-cols-2">
              {/* מתחרים עיקריים */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Target className="h-4 w-4 text-blue-600" />
                    מתחרים עיקריים
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data!.topCompetitors.length > 0 ? (
                    <div className="space-y-2">
                      {data!.topCompetitors.map((comp, idx) => (
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
                  ) : (
                    <p className="py-4 text-center text-sm text-muted-foreground">לא נמצאו מתחרים עדיין</p>
                  )}
                  <Link href="/app/competitors" className="mt-4 flex items-center justify-center gap-1 text-sm text-primary hover:underline">
                    כל המתחרים <ArrowLeft className="h-3.5 w-3.5" />
                  </Link>
                </CardContent>
              </Card>

              {/* טרנדים חמים */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Activity className="h-4 w-4 text-blue-600" />
                    טרנדים חמים
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data!.topTrends.length > 0 ? (
                    <div className="space-y-2">
                      {data!.topTrends.map((trend, idx) => (
                        <div key={idx} className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                          <div className="min-w-0 flex items-center gap-2">
                            <DirectionIcon direction={trend.direction} />
                            <p className="text-sm font-medium truncate">{trend.name}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {trend.score > 0 && (
                              <span className="text-xs text-muted-foreground">{trend.score}</span>
                            )}
                            <Badge variant="outline" className={directionClass(trend.direction)}>
                              {directionLabel(trend.direction)}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-4 text-center text-sm text-muted-foreground">
                      <p>אין טרנדים עדיין</p>
                      <Link href="/app/trends" className="text-primary text-xs hover:underline">בצע סנכרון טרנדים →</Link>
                    </div>
                  )}
                  <Link href="/app/trends" className="mt-4 flex items-center justify-center gap-1 text-sm text-primary hover:underline">
                    כל הטרנדים <ArrowLeft className="h-3.5 w-3.5" />
                  </Link>
                </CardContent>
              </Card>

              {/* טרנדים אצל מתחרים */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingUp className="h-4 w-4 text-blue-600" />
                    טרנדים אצל מתחרים
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data!.competitorTrendItems.length > 0 ? (
                    <div className="space-y-2">
                      {data!.competitorTrendItems.map((item, i) => (
                        <div key={i} className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                          <p className="text-sm font-medium truncate">{item.competitor_name}</p>
                          <Badge variant="outline" className="border-blue-200 text-blue-600 shrink-0 ml-2">
                            {item.keyword}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="py-4 text-center text-sm text-muted-foreground">נתונים יתעדכנו בסנכרון הבא</p>
                  )}
                  <Link href="/app/trends" className="mt-4 flex items-center justify-center gap-1 text-sm text-primary hover:underline">
                    כל הטרנדים <ArrowLeft className="h-3.5 w-3.5" />
                  </Link>
                </CardContent>
              </Card>

              {/* חדשות אחרונות */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Newspaper className="h-4 w-4 text-blue-600" />
                    חדשות אחרונות
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data!.recentNews.length > 0 ? (
                    <div className="space-y-2">
                      {data!.recentNews.map((item, i) => (
                        <div key={i} className="rounded-lg bg-muted/50 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium line-clamp-2 flex-1">{item.title}</p>
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            {item.source && (
                              <Badge variant="outline" className="text-xs px-1.5 py-0">{item.source}</Badge>
                            )}
                            <span className="text-xs text-muted-foreground">{formatTimeAgo(item.published_at)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="py-4 text-center text-sm text-muted-foreground">אין חדשות עדיין — בצע סנכרון</p>
                  )}
                  <Link href="/app/news" className="mt-4 flex items-center justify-center gap-1 text-sm text-primary hover:underline">
                    כל החדשות <ArrowLeft className="h-3.5 w-3.5" />
                  </Link>
                </CardContent>
              </Card>

              {/* SEO / GEO Summary */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Search className="h-4 w-4 text-blue-600" />
                    דירוג SEO / GEO
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data!.seoGeo ? (
                    <div className="space-y-2">
                      {data!.seoGeo.bestSeoPosition != null && (
                        <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium flex items-center gap-1.5">
                              <Search className="h-3.5 w-3.5 text-blue-500 shrink-0" />SEO — מיקום מוביל
                            </p>
                            {data!.seoGeo.seoQuery && (
                              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">"{data!.seoGeo.seoQuery}"</p>
                            )}
                          </div>
                          <Badge variant="outline" className={
                            data!.seoGeo.bestSeoPosition <= 3 ? "border-green-200 text-green-600" :
                            data!.seoGeo.bestSeoPosition <= 7 ? "border-yellow-200 text-yellow-600" :
                            "border-red-200 text-red-600"
                          }>#{data!.seoGeo.bestSeoPosition}</Badge>
                        </div>
                      )}
                      {data!.seoGeo.bestGeoPosition != null && (
                        <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium flex items-center gap-1.5">
                              <Globe className="h-3.5 w-3.5 text-teal-500 shrink-0" />GEO — מיקום מוביל
                            </p>
                            {data!.seoGeo.geoEngine && (
                              <p className="text-xs text-muted-foreground mt-0.5">{data!.seoGeo.geoEngine}</p>
                            )}
                          </div>
                          <Badge variant="outline" className={
                            data!.seoGeo.bestGeoPosition <= 3 ? "border-green-200 text-green-600" :
                            data!.seoGeo.bestGeoPosition <= 7 ? "border-yellow-200 text-yellow-600" :
                            "border-red-200 text-red-600"
                          }>#{data!.seoGeo.bestGeoPosition}</Badge>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="py-4 text-center text-sm text-muted-foreground">אין נתוני דירוג עדיין — בצע סנכרון SEO</p>
                  )}
                  <Link href="/app/seo-geo" className="mt-4 flex items-center justify-center gap-1 text-sm text-primary hover:underline">
                    צפה בדוח מלא <ArrowLeft className="h-3.5 w-3.5" />
                  </Link>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* ═══════════════════════════════════════════════════════ */}
          {/* GROUP 3 — פיתוח עסקי                                   */}
          {/* ═══════════════════════════════════════════════════════ */}
          <section>
            <GroupHeader color="bg-green-500" label="פיתוח עסקי" />
            <div className="grid gap-4 md:grid-cols-2">
              {/* מכרזים קרובים */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="h-4 w-4 text-green-600" />
                    מכרזים קרובים
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data!.upcomingTenders.length > 0 ? (
                    <div className="space-y-2">
                      {data!.upcomingTenders.map((tender, idx) => {
                        const days = getDaysUntil(tender.deadline)
                        return (
                          <div key={idx} className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium line-clamp-1">{tender.title}</p>
                              <p className="text-xs text-muted-foreground">{tender.organization}</p>
                            </div>
                            <Badge variant="outline" className={
                              days <= 14 ? "border-red-200 text-red-600 shrink-0" : "border-green-200 text-green-600 shrink-0"
                            }>
                              {days > 0 ? `${days} ימים` : "היום"}
                            </Badge>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="py-4 text-center text-sm text-muted-foreground">
                      <p>אין מכרזים פעילים כרגע</p>
                      <Link href="/app/tenders" className="text-primary text-xs hover:underline">עבור למכרזים →</Link>
                    </div>
                  )}
                  <Link href="/app/tenders" className="mt-4 flex items-center justify-center gap-1 text-sm text-primary hover:underline">
                    כל המכרזים <ArrowLeft className="h-3.5 w-3.5" />
                  </Link>
                </CardContent>
              </Card>

              {/* כנסים קרובים */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Calendar className="h-4 w-4 text-green-600" />
                    כנסים קרובים
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data!.upcomingConferences.length > 0 ? (
                    <div className="space-y-2">
                      {data!.upcomingConferences.map((conf, idx) => (
                        <div key={idx} className="rounded-lg bg-muted/50 p-3">
                          <p className="text-sm font-medium">{conf.name}</p>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                            {conf.date && <span>{conf.date}</span>}
                            {conf.location && <span>· {conf.location}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-4 text-center text-sm text-muted-foreground">
                      <p>אין כנסים קרובים</p>
                      <Link href="/app/conferences" className="text-primary text-xs hover:underline">עבור לכנסים →</Link>
                    </div>
                  )}
                  <Link href="/app/conferences" className="mt-4 flex items-center justify-center gap-1 text-sm text-primary hover:underline">
                    כל הכנסים <ArrowLeft className="h-3.5 w-3.5" />
                  </Link>
                </CardContent>
              </Card>
            </div>
          </section>

        </div>
      )}
    </div>
  )
}
