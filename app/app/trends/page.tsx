"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TrendingUp, TrendingDown, Minus, Loader2, Sparkles } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface Trend {
  id: string
  company_id: string
  name: string
  category: string
  direction: string
  description: string
  created_at: string
}

function getMomentumBadge(direction: string) {
  if (direction === 'עולה' || direction === 'up') {
    return (
      <Badge className="bg-green-100 text-green-700">
        <TrendingUp className="ml-1 h-3 w-3" />
        עולה
      </Badge>
    )
  }
  if (direction === 'יורד' || direction === 'down') {
    return (
      <Badge className="bg-red-100 text-red-700">
        <TrendingDown className="ml-1 h-3 w-3" />
        יורד
      </Badge>
    )
  }
  return (
    <Badge className="bg-yellow-100 text-yellow-700">
      <Minus className="ml-1 h-3 w-3" />
      יציב
    </Badge>
  )
}

export default function TrendsPage() {
  const [trends, setTrends] = useState<Trend[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const supabase = createClient()
  const { toast } = useToast()

  useEffect(() => {
    fetchTrends()
  }, [])

  async function fetchTrends() {
    const { data, error } = await supabase
      .from("trends")
      .select("*")
      .order("created_at", { ascending: false })

    if (!error && data) {
      setTrends(data)
    }
    setLoading(false)
  }

  async function generateTrends() {
    setGenerating(true)
    try {
      const response = await fetch("/api/generate-trends", { method: "POST" })
      const data = await response.json()

      if (data.success) {
        await fetchTrends()
        toast({
          title: "טרנדים נוספו!",
          description: `נמצאו ${data.count || 0} טרנדים חדשים`,
        })
      } else {
        toast({
          title: "שגיאה",
          description: data.error || "לא הצלחנו ליצור טרנדים",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error generating trends:", error)
      toast({
        title: "שגיאה",
        description: "אירעה שגיאה בעת יצירת הטרנדים",
        variant: "destructive",
      })
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

  // Group by source (stored in category)
  const sourceGroups = trends.reduce((acc, t) => {
    const src = t.category || 'אחר'
    if (!acc[src]) acc[src] = []
    acc[src].push(t)
    return acc
  }, {} as Record<string, Trend[]>)

  const sources = Object.keys(sourceGroups)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">טרנדים</h1>
          <p className="text-muted-foreground">מעקב אחר מגמות שוק ותחומים מתפתחים</p>
        </div>
        <Button onClick={generateTrends} disabled={generating}>
          {generating ? (
            <>
              <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              מנתח טרנדים...
            </>
          ) : (
            <>
              <Sparkles className="ml-2 h-4 w-4" />
              גלה טרנדים עם AI
            </>
          )}
        </Button>
      </div>

      {/* Trends grouped by source */}
      {sources.map((source) => (
        <div key={source} className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground border-b pb-2">{source}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {sourceGroups[source].map((trend) => (
              <Card key={trend.id} className="transition-shadow hover:shadow-md">
                <CardContent className="p-5">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <h3 className="text-base font-semibold text-foreground leading-snug">
                      {trend.name}
                    </h3>
                    {getMomentumBadge(trend.direction)}
                  </div>
                  <p className="text-sm text-muted-foreground">{trend.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}

      {trends.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <TrendingUp className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">לא נמצאו טרנדים</p>
            <Button className="mt-4" onClick={generateTrends} disabled={generating}>
              <Sparkles className="ml-2 h-4 w-4" />
              גלה טרנדים עם AI
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
