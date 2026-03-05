import { Card, CardContent } from "@/components/ui/card"
import { TrendingUp, TrendingDown, Target, Lightbulb, Users, FileText, UserPlus, Activity } from "lucide-react"
import { cn } from "@/lib/utils"

interface KpiStat {
  id: string
  stat_name: string
  stat_value: number
  stat_max: number | null
  change_percent: number | null
  change_direction: string | null
}

interface KpiCardsProps {
  stats: KpiStat[]
}

const kpiConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  opportunity_score: { label: "ציון הזדמנות", icon: Target, color: "text-primary" },
  new_opportunities: { label: "הזדמנויות חדשות", icon: Lightbulb, color: "text-amber-400" },
  competitor_changes: { label: "פעילות מתחרים", icon: Users, color: "text-red-400" },
  tender_alerts: { label: "התראות מכרז", icon: FileText, color: "text-blue-400" },
  new_leads: { label: "לידים חדשים", icon: UserPlus, color: "text-emerald-400" },
  identified_trends: { label: "טרנדים מזוהים", icon: Activity, color: "text-purple-400" },
}

export function KpiCards({ stats }: KpiCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {stats.map((stat) => {
        const config = kpiConfig[stat.stat_name]
        if (!config) return null

        const Icon = config.icon
        const isUp = stat.change_direction === "up"
        const TrendIcon = isUp ? TrendingUp : TrendingDown

        return (
          <Card key={stat.id} className="bg-card border-border hover:border-primary/50 transition-colors">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className={cn("p-2 rounded-lg bg-secondary", config.color)}>
                  <Icon className="w-4 h-4" />
                </div>
                {stat.change_percent !== null && (
                  <div className={cn(
                    "flex items-center gap-1 text-xs font-medium",
                    isUp ? "text-emerald-400" : "text-red-400"
                  )}>
                    <TrendIcon className="w-3 h-3" />
                    <span>{Math.abs(stat.change_percent)}%</span>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <p className="text-2xl font-bold text-foreground">
                  {stat.stat_value}
                  {stat.stat_max && (
                    <span className="text-sm font-normal text-muted-foreground">/{stat.stat_max}</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">{config.label}</p>
                {stat.stat_name === "competitor_changes" && (
                  <p className="text-xs text-muted-foreground">שינויים</p>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
