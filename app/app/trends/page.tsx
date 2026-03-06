"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { TrendingUp, TrendingDown, Minus, Loader2 } from "lucide-react"
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

// Mock data for when DB is empty
const mockTrends: Trend[] = [
  {
    id: "1",
    company_id: "",
    name: "בינה מלאכותית גנרטיבית",
    category: "טכנולוגיה",
    score: 95,
    direction: "up",
    description: "עלייה חדה באימוץ כלי AI גנרטיבי בעסקים ישראליים",
    created_at: new Date().toISOString(),
  },
  {
    id: "2",
    company_id: "",
    name: "אוטומציה עסקית",
    category: "תפעול",
    score: 82,
    direction: "up",
    description: "גידול בביקוש לפתרונות אוטומציה של תהליכים",
    created_at: new Date().toISOString(),
  },
  {
    id: "3",
    company_id: "",
    name: "סייבר סקיוריטי",
    category: "אבטחה",
    score: 78,
    direction: "stable",
    description: "ביקוש יציב לפתרונות אבטחת מידע",
    created_at: new Date().toISOString(),
  },
  {
    id: "4",
    company_id: "",
    name: "פינטק",
    category: "פיננסים",
    score: 71,
    direction: "down",
    description: "ירידה קלה בהשקעות בסטארטאפי פינטק",
    created_at: new Date().toISOString(),
  },
]

function getTrendIcon(direction: string) {
  switch (direction) {
    case "up":
      return <TrendingUp className="h-4 w-4 text-green-500" />
    case "down":
      return <TrendingDown className="h-4 w-4 text-red-500" />
    default:
      return <Minus className="h-4 w-4 text-yellow-500" />
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
  const supabase = createClient()

  useEffect(() => {
    fetchTrends()
  }, [])

  async function fetchTrends() {
    const { data, error } = await supabase
      .from("trends")
      .select("*")
      .order("score", { ascending: false })

    if (!error && data && data.length > 0) {
      setTrends(data)
    } else {
      // Use mock data if no data in DB
      setTrends(mockTrends)
    }
    setLoading(false)
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
      <div>
        <h1 className="text-2xl font-bold text-foreground">טרנדים</h1>
        <p className="text-muted-foreground">מעקב אחר מגמות שוק ותחומים מתפתחים</p>
      </div>

      {/* Chart */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-lg text-foreground">ציון טרנדים לפי תחום</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
                <XAxis type="number" domain={[0, 100]} stroke="#8b9dc3" />
                <YAxis dataKey="name" type="category" width={100} stroke="#8b9dc3" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0a1628",
                    border: "1px solid #1e3a5f",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="score" fill="#00d4aa" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Trend Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {trends.map((trend) => (
          <Card key={trend.id} className="border-border bg-card">
            <CardContent className="p-5">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{trend.name}</h3>
                  <Badge variant="outline" className="mt-1 border-border text-muted-foreground">
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
        <Card className="border-border bg-card">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <TrendingUp className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">לא נמצאו טרנדים</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
