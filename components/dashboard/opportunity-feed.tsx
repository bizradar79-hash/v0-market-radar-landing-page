import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ArrowLeft, Lightbulb, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

interface Opportunity {
  id: string
  title: string
  description: string
  source: string
  impact_score: number
  priority: string
  recommended_actions: string[]
  category: string
}

interface OpportunityFeedProps {
  opportunities: Opportunity[]
}

const priorityColors: Record<string, string> = {
  "גבוהה": "bg-red-500/20 text-red-400 border-red-500/30",
  "בינונית": "bg-amber-500/20 text-amber-400 border-amber-500/30",
  "נמוכה": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
}

export function OpportunityFeed({ opportunities }: OpportunityFeedProps) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/20">
            <Lightbulb className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">הזדמנויות עסקיות</CardTitle>
            <p className="text-sm text-muted-foreground">הזדמנויות שזוהו על ידי המערכת</p>
          </div>
        </div>
        <Button variant="ghost" className="text-primary hover:text-primary/80">
          צפה בכל ההזדמנויות
          <ArrowLeft className="w-4 h-4 mr-2" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {opportunities.map((opportunity) => (
          <div
            key={opportunity.id}
            className="p-4 rounded-xl bg-secondary/50 border border-border hover:border-primary/30 transition-colors"
          >
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-foreground">{opportunity.title}</h3>
                  <Badge 
                    variant="outline" 
                    className={cn("text-xs", priorityColors[opportunity.priority])}
                  >
                    {opportunity.priority}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {opportunity.description}
                </p>
              </div>
              <div className="text-left min-w-[80px]">
                <p className="text-2xl font-bold text-primary">{opportunity.impact_score}</p>
                <p className="text-xs text-muted-foreground">ציון השפעה</p>
              </div>
            </div>

            <div className="mb-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>רמת השפעה</span>
                <span>{opportunity.impact_score}%</span>
              </div>
              <Progress value={opportunity.impact_score} className="h-2" />
            </div>

            {opportunity.recommended_actions && opportunity.recommended_actions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <Sparkles className="w-4 h-4 text-primary mt-0.5" />
                {opportunity.recommended_actions.slice(0, 3).map((action, index) => (
                  <Badge 
                    key={index} 
                    variant="secondary" 
                    className="text-xs bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 cursor-pointer"
                  >
                    {action}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
