"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { ExternalLink, Clock, Loader2, Newspaper, Bookmark } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"

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
  const supabase = createClient()
  const { toast } = useToast()

  useEffect(() => { fetchNews() }, [])

  async function saveNewsItem(item: NewsItem) {
    try {
      const res = await fetch('/api/saved-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_type: 'news',
          item_id: item.id,
          title: item.title,
          description: item.summary?.slice(0, 160) || null,
          url: item.url || null,
          source_module: 'חדשות',
          metadata: { source: item.source, category: item.category, published_at: item.published_at },
        }),
      })
      if (res.ok) {
        toast({ title: 'החדשה נשמרה' })
        const win = window as any
        if (typeof win.refreshSidebarCounts === 'function') win.refreshSidebarCounts()
      }
    } catch {}
  }

  async function fetchNews() {
    const { data, error } = await supabase
      .from("news")
      .select("*")
      .order("published_at", { ascending: false })
    if (!error && data) setNews(data)
    setLoading(false)
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
      <div>
        <h1 className="text-2xl font-bold text-foreground">חדשות</h1>
        <p className="text-muted-foreground text-sm">עדכונים רלוונטיים לעסק שלך מישראל ומהעולם</p>
      </div>

      {/* News feed */}
      {feed.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <Newspaper className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">אין חדשות עדיין</p>
          <p className="text-xs text-muted-foreground mt-1">החדשות יתעדכנו אוטומטית בסנכרון השבועי</p>
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
              onClick={(e) => {
                if (!item.url) { e.preventDefault(); toast({ title: "הקישור אינו זמין", variant: "destructive" }) }
              }}
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

              {/* Source + external link + save */}
              <div className="flex items-center justify-between mt-auto pt-1">
                <span className="text-xs font-medium text-muted-foreground truncate">{item.source}</span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    title="שמור חדשה"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); saveNewsItem(item) }}
                  >
                    <Bookmark className="h-3 w-3" />
                  </Button>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
