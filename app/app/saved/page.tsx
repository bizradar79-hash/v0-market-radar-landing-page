"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Bookmark, Trash2, ExternalLink, Loader2, FileText, Calendar, Newspaper, Share2, CheckSquare, Search, BarChart3 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface SavedItem {
  id: string
  company_id: string
  item_type: string
  item_id: string | null
  title: string
  description: string | null
  url: string | null
  source_module: string | null
  metadata: any
  saved_at: string
}

const TYPE_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  tender:          { label: 'מכרזים',           icon: <FileText className="h-4 w-4" />,    color: 'bg-blue-100 text-blue-700 border-blue-200' },
  conference:      { label: 'כנסים',            icon: <Calendar className="h-4 w-4" />,    color: 'bg-purple-100 text-purple-700 border-purple-200' },
  news:            { label: 'חדשות',            icon: <Newspaper className="h-4 w-4" />,   color: 'bg-orange-100 text-orange-700 border-orange-200' },
  channel:         { label: 'ערוצי הפצה',       icon: <Share2 className="h-4 w-4" />,      color: 'bg-green-100 text-green-700 border-green-200' },
  action:          { label: 'פעולות שבועיות',   icon: <CheckSquare className="h-4 w-4" />, color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  niche:           { label: 'נישות',            icon: <Search className="h-4 w-4" />,      color: 'bg-pink-100 text-pink-700 border-pink-200' },
  market_analysis: { label: 'ניתוח שוק',        icon: <BarChart3 className="h-4 w-4" />,   color: 'bg-teal-100 text-teal-700 border-teal-200' },
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function SavedPage() {
  const [items, setItems] = useState<SavedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const { toast } = useToast()

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/saved-items')
      const data = await res.json()
      setItems(data.items || [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

  async function deleteItem(id: string) {
    setDeleting(id)
    try {
      const res = await fetch(`/api/saved-items?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== id))
        toast({ title: 'הפריט הוסר' })
        // Refresh sidebar count
        const win = window as any
        if (typeof win.refreshSidebarCounts === 'function') win.refreshSidebarCounts()
      }
    } finally {
      setDeleting(null)
    }
  }

  // Group items by type
  const grouped = items.reduce<Record<string, SavedItem[]>>((acc, item) => {
    if (!acc[item.item_type]) acc[item.item_type] = []
    acc[item.item_type].push(item)
    return acc
  }, {})

  const typeOrder = ['tender', 'conference', 'news', 'channel', 'action', 'niche', 'market_analysis']
  const sortedTypes = [
    ...typeOrder.filter(t => grouped[t]),
    ...Object.keys(grouped).filter(t => !typeOrder.includes(t)),
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20" dir="rtl">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Bookmark className="h-6 w-6 text-primary" />
          פריטים שמורים
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          כל הפריטים שסימנת לשמירה ממודולים שונים במערכת
        </p>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Bookmark className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-muted-foreground text-sm">עדיין לא שמרת פריטים</p>
            <p className="text-xs text-muted-foreground mt-1">לחץ על כפתור "שמור" בכל מודול להוסיף פריטים</p>
          </CardContent>
        </Card>
      ) : (
        sortedTypes.map(type => {
          const meta = TYPE_META[type] || { label: type, icon: <Bookmark className="h-4 w-4" />, color: 'bg-gray-100 text-gray-700 border-gray-200' }
          const typeItems = grouped[type]
          return (
            <Card key={type}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  {meta.icon}
                  {meta.label}
                  <Badge variant="secondary" className="mr-1">{typeItems.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {typeItems.map(item => (
                  <div key={item.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3 hover:bg-secondary/30 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                        {item.source_module && (
                          <Badge className={`text-xs ${meta.color}`}>{item.source_module}</Badge>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">נשמר ב‑{formatDate(item.saved_at)}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {item.url && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                          <a href={item.url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteItem(item.id)}
                        disabled={deleting === item.id}
                      >
                        {deleting === item.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )
        })
      )}
    </div>
  )
}
