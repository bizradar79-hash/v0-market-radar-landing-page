import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Newspaper, ArrowLeft, ExternalLink, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"

interface NewsItem {
  id: string
  title: string
  summary: string
  source: string
  url: string
  category: string
  published_at: string
}

interface NewsFeedProps {
  news: NewsItem[]
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

const categoryColors: Record<string, string> = {
  "גיוסים": "bg-emerald-500/20 text-emerald-400",
  "רגולציה": "bg-blue-500/20 text-blue-400",
  "שותפויות": "bg-purple-500/20 text-purple-400",
  "השקעות": "bg-amber-500/20 text-amber-400",
}

export function NewsFeed({ news }: NewsFeedProps) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/20">
            <Newspaper className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <CardTitle className="text-lg">חדשות אחרונות</CardTitle>
            <p className="text-sm text-muted-foreground">עדכונים חמים מהשוק</p>
          </div>
        </div>
        <Button variant="ghost" className="text-primary hover:text-primary/80">
          צפה בכל החדשות
          <ArrowLeft className="w-4 h-4 mr-2" />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {news.map((item) => (
            <div
              key={item.id}
              className="p-4 rounded-xl bg-secondary/50 border border-border hover:border-primary/30 transition-colors group cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <Badge className={categoryColors[item.category] || "bg-secondary text-muted-foreground"}>
                  {item.category}
                </Badge>
                <ExternalLink className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <h3 className="font-semibold text-foreground mb-2 line-clamp-2 group-hover:text-primary transition-colors">
                {item.title}
              </h3>
              {item.summary && (
                <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                  {item.summary}
                </p>
              )}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="font-medium">{item.source}</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatTimeAgo(item.published_at)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
