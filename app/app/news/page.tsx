"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ExternalLink, Clock, TrendingUp, TrendingDown, Minus, Loader2, Newspaper } from "lucide-react"

interface NewsItem {
  id: string
  company_id: string
  title: string
  summary: string
  source: string
  url: string
  category: string
  sentiment: string
  published_at: string
  created_at: string
}



function getSentimentBadge(sentiment: string) {
  switch (sentiment) {
    case "positive":
      return (
        <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20">
          <TrendingUp className="ml-1 h-3 w-3" />
          חיובי
        </Badge>
      )
    case "negative":
      return (
        <Badge className="bg-red-500/10 text-red-500 hover:bg-red-500/20">
          <TrendingDown className="ml-1 h-3 w-3" />
          שלילי
        </Badge>
      )
    default:
      return (
        <Badge className="bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20">
          <Minus className="ml-1 h-3 w-3" />
          ניטרלי
        </Badge>
      )
  }
}

function getCategoryColor(category: string) {
  const colors: Record<string, string> = {
    "גיוסים": "bg-blue-500/10 text-blue-500",
    "רגולציה": "bg-purple-500/10 text-purple-500",
    "שותפויות": "bg-green-500/10 text-green-500",
    "השקעות": "bg-yellow-500/10 text-yellow-500",
    "מכרזים": "bg-cyan-500/10 text-cyan-500",
    "מתחרים": "bg-red-500/10 text-red-500",
    "אירועים": "bg-pink-500/10 text-pink-500",
    "מחקרים": "bg-indigo-500/10 text-indigo-500",
  }
  return colors[category] || "bg-gray-500/10 text-gray-500"
}

function formatTimeAgo(dateString: string) {
  const date = new Date(dateString)
  const now = new Date()
  const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60))
  
  if (diffHours < 1) return "לפני פחות משעה"
  if (diffHours < 24) return `לפני ${diffHours} שעות`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return "לפני יום"
  return `לפני ${diffDays} ימים`
}

export default function NewsPage() {
  const [news, setNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    fetchNews()
  }, [])

  async function fetchNews() {
    const { data, error } = await supabase
      .from("news")
      .select("*")
      .order("published_at", { ascending: false })

    if (!error && data) {
      setNews(data)
    }
    setLoading(false)
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
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">חדשות</h1>
        <p className="text-muted-foreground">עדכונים וחדשות רלוונטיות לעסק שלך</p>
      </div>

      {/* News Feed */}
      <div className="space-y-4">
        {news.map((item) => (
          <Card key={item.id} className="border-border bg-card transition-colors hover:bg-card/80">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge className={getCategoryColor(item.category)}>
                      {item.category}
                    </Badge>
                    {getSentimentBadge(item.sentiment)}
                  </div>
                  
                  <h3 className="mb-2 text-lg font-semibold text-foreground">
                    {item.title}
                  </h3>
                  
                  <p className="mb-3 text-sm text-muted-foreground">
                    {item.summary}
                  </p>
                  
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="font-medium">{item.source}</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatTimeAgo(item.published_at)}
                    </span>
                  </div>
                </div>
                
                <Button variant="ghost" size="icon" className="shrink-0" asChild>
                  <a href={item.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {news.length === 0 && (
        <Card className="border-border bg-card">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Newspaper className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">לא נמצאו חדשות</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
