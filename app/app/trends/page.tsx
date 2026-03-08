"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { TrendingUp, TrendingDown, Minus, Loader2, Sparkles } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

interface Trend {
  id: string
  company_id: string
  name: string
  category: string
  score: number
  direction: string
  description: string
  created_at: string
}

function getTrendIcon(direction: string) {
  switch (direction) {
    case "up":
      return <TrendingUp className="h-4 w-4 text-green-600" />
    case "down":
      return <TrendingDown className="h-4 w-4 text-red-600" />
    default:
      return <Minus className="h-4 w-4 text-yellow-600" />
  }
}

function getDirectionText(direction: string) {
  switch (direction) {
    case "up":
      return "עולה"
    case "down":
      return "יורד"
    default:
      return "יציב"
  }
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
      .order("score", { ascending: false })

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
          title: "מגמות נוספו!",
          description: `נמצאו ${data.count || 0} מגמות חדשות`,
        })
      } else {
        toast({
          title: "שגיאה",
          description: data.error || "לא הצלחנו ליצור מגמות",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error generating trends:", error)
      toast({
        title: "שגיאה",
        description: "אירעה שגיאה בעת יצירת המגמות",
        variant: "destructive",
      })
    } finally {
      setGenerating(false)
    }
  }

  const chartData = trends.map(t => ({
    name: t.name.length > 15 ? t.name.substring(0, 15) + "..." : t.name,
    score: t.score,
  }))

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">טרנדים</h1>
          <p className="text-muted-foreground">מעקב אחר מגמות שוק ותחומים מתפתחים</p>
        </div>
        <Button onClick={generateTrends} disabled={generating}>
          {generating ? (
            <>
              <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              מנתח מגמות...
            </>
          ) : (
            <>
              <Sparkles className="ml-2 h-4 w-4" />
              גלה מגמות עם AI
            </>
          )}
        </Button>
      </div>

      {/* Chart */}
      {trends.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">ציון טרנדים לפי תחום</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" domain={[0, 100]} stroke="hsl(var(--muted-foreground))" />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={220}
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fontSize: 11, fill: '#374151' }}
                    tickFormatter={(val: string) => val.length > 25 ? val.slice(0, 25) + '...' : val}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="score" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Trend Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {trends.map((trend) => (
          <Card key={trend.id}>
            <CardContent className="p-5">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{trend.name}</h3>
                  <Badge variant="secondary" className="mt-1">
                    {trend.category}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  {getTrendIcon(trend.direction)}
                  <span className="text-sm text-muted-foreground">
                    {getDirectionText(trend.direction)}
                  </span>
                </div>
              </div>

              <p className="mb-4 text-sm text-muted-foreground">{trend.description}</p>

              <div className="mb-4">
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">ציון טרנד</span>
                  <span className="font-semibold text-primary">{trend.score}/100</span>
                </div>
                <Progress value={trend.score} className="h-2" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {trends.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <TrendingUp className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">לא נמצאו טרנדים</p>
            <Button className="mt-4" onClick={generateTrends} disabled={generating}>
              <Sparkles className="ml-2 h-4 w-4" />
              גלה מגמות עם AI
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
