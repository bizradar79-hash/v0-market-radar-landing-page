"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ExternalLink, Clock, Loader2, Newspaper, Sparkles } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface NewsItem {
  id: string
  company_id: string
  title: string
  summary: string
  source: string
  url: string
  category: string // 'ישראל' | 'עולם'
  sentiment: string
  published_at: string
  created_at: string
}

function formatDate(dateString: string) {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHours / 24)

  if (diffHours < 1) return "לפני פחות משעה"
  if (diffHours < 24) return `לפני ${diffHours} שעות`
  if (diffDays === 1) return "אתמול"
  if (diffDays < 7) return `לפני ${diffDays} ימים`
  return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })
}

function RegionBadge({ region }: { region: string }) {
  const isIsrael = region === 'ישראל'
  return (
    <Badge
      className={`text-xs font-medium px-2 py-0.5 ${
        isIsrael
          ? 'bg-blue-100 text-blue-700 border-blue-200'
          : 'bg-violet-100 text-violet-700 border-violet-200'
      }`}
    >
      {isIsrael ? '🇮🇱 ישראל' : '🌍 עולם'}
    </Badge>
  )
}

export default function NewsPage() {
  const [news, setNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const supabase = createClient()
  const { toast } = useToast()

  useEffect(() => { fetchNews() }, [])

  async function fetchNews() {
    const { data, error } = await supabase
      .from("news")
      .select("*")
      .order("published_at", { ascending: false })
    if (!error && data) setNews(data)
    setLoading(false)
  }

  async function generateNews() {
    setGenerating(true)
    try {
      const response = await fetch("/api/generate-news?force=true", { method: "POST" })
      const data = await response.json()
      if (data.success) {
        await fetchNews()
        toast({ title: "חדשות עודכנו", description: `נמצאו ${data.count || 0} כתבות` })
      } else {
        toast({ title: "שגיאה", description: data.error || "לא הצלחנו לטעון חדשות", variant: "destructive" })
      }
    } catch {
      toast({ title: "שגיאה", description: "אירעה שגיאה", variant: "destructive" })
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // Cap at 5 Israeli + 5 international, sort by date
  const sorted = [...news].sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
  const israelNews = sorted.filter(n => n.category === 'ישראל').slice(0, 5)
  const worldNews = sorted.filter(n => n.category === 'עולם').slice(0, 5)
  const feed = [...israelNews, ...worldNews].sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">חדשות</h1>
          <p className="text-muted-foreground text-sm">עדכונים רלוונטיים לעסק שלך מישראל ומהעולם</p>
        </div>
        <Button onClick={generateNews} disabled={generating} size="sm">
          {generating ? (
            <><Loader2 className="ml-2 h-4 w-4 animate-spin" />מעדכן...</>
          ) : (
            <><Sparkles className="ml-2 h-4 w-4" />עדכן חדשות</>
          )}
        </Button>
      </div>

      {/* News feed */}
      {feed.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <Newspaper className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">אין חדשות עדיין</p>
          <p className="text-xs text-muted-foreground mt-1">לחץ "עדכן חדשות" לטעינת חדשות רלוונטיות לעסק שלך</p>
          <Button onClick={generateNews} disabled={generating} variant="outline" size="sm" className="mt-4">
            {generating ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Sparkles className="ml-2 h-4 w-4" />}
            {generating ? 'מחפש חדשות...' : 'טען חדשות עם AI'}
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {feed.map((item) => (
            <a
              key={item.id}
              href={item.url || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-md hover:border-primary/20"
            >
              {/* Top row: region badge + date */}
              <div className="flex items-center justify-between">
                <RegionBadge region={item.category} />
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {formatDate(item.published_at)}
                </span>
              </div>

              {/* Headline */}
              <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                {item.title}
              </h3>

              {/* Summary */}
              {item.summary && (
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                  {item.summary}
                </p>
              )}

              {/* Source + external link */}
              <div className="flex items-center justify-between mt-auto pt-1">
                <span className="text-xs font-medium text-muted-foreground truncate">{item.source}</span>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
