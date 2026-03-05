import { createClient } from "@/lib/supabase/server"
import { KpiCards } from "@/components/dashboard/kpi-cards"
import { OpportunityFeed } from "@/components/dashboard/opportunity-feed"
import { CompetitorTable } from "@/components/dashboard/competitor-table"
import { TrendRadar } from "@/components/dashboard/trend-radar"
import { NewsFeed } from "@/components/dashboard/news-feed"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"

export default async function DashboardPage() {
  const supabase = await createClient()

  const [
    { data: kpiStats },
    { data: opportunities },
    { data: competitors },
    { data: trends },
    { data: news },
    { data: alerts },
  ] = await Promise.all([
    supabase.from("kpi_stats").select("*"),
    supabase.from("opportunities").select("*").order("impact_score", { ascending: false }).limit(4),
    supabase.from("competitors").select("*").order("detected_at", { ascending: false }).limit(5),
    supabase.from("trends").select("*").order("score", { ascending: false }).limit(6),
    supabase.from("news").select("*").order("published_at", { ascending: false }).limit(4),
    supabase.from("alerts").select("*").eq("is_read", false).order("created_at", { ascending: false }),
  ])

  return (
    <div className="p-6 space-y-6">
      <DashboardHeader alertCount={alerts?.length || 0} />
      
      {/* KPI Cards */}
      <KpiCards stats={kpiStats || []} />

      {/* Opportunity Feed */}
      <OpportunityFeed opportunities={opportunities || []} />

      {/* Two columns: Competitors + Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CompetitorTable competitors={competitors || []} />
        <TrendRadar trends={trends || []} />
      </div>

      {/* News Feed */}
      <NewsFeed news={news || []} />
    </div>
  )
}
