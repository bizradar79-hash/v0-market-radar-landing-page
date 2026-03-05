import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Users, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface Competitor {
  id: string
  name: string
  activity_type: string
  change_description: string
  impact: string
  detected_at: string
}

interface CompetitorTableProps {
  competitors: Competitor[]
}

const impactColors: Record<string, string> = {
  "גבוה": "bg-red-500/20 text-red-400",
  "בינוני": "bg-amber-500/20 text-amber-400",
  "נמוך": "bg-emerald-500/20 text-emerald-400",
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHours / 24)

  if (diffHours < 1) return "לפני פחות משעה"
  if (diffHours < 24) return `לפני ${diffHours} שעות`
  if (diffDays === 1) return "אתמול"
  return `לפני ${diffDays} ימים`
}

export function CompetitorTable({ competitors }: CompetitorTableProps) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-500/20">
            <Users className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <CardTitle className="text-lg">פעילות מתחרים</CardTitle>
            <p className="text-sm text-muted-foreground">שינויים אחרונים אצל מתחרים</p>
          </div>
        </div>
        <Button variant="ghost" className="text-primary hover:text-primary/80">
          צפה בכל
          <ArrowLeft className="w-4 h-4 mr-2" />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {competitors.map((competitor) => (
            <div
              key={competitor.id}
              className="flex items-center gap-4 p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center border border-border">
                <span className="text-sm font-medium text-foreground">
                  {competitor.name.charAt(0)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="font-medium text-foreground truncate">{competitor.name}</p>
                  <Badge variant="outline" className="text-xs">
                    {competitor.activity_type}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground truncate">
                  {competitor.change_description}
                </p>
              </div>
              <div className="text-left flex flex-col items-end gap-1">
                <Badge className={cn("text-xs", impactColors[competitor.impact])}>
                  {competitor.impact}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formatTimeAgo(competitor.detected_at)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
