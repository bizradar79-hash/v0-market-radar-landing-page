"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { TrendingUp, TrendingDown, Minus, ArrowUpRight } from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

const trends = [
  {
    id: 1,
    name: "בינה מלאכותית גנרטיבית",
    category: "טכנולוגיה",
    score: 95,
    growth: 42,
    direction: "up",
    description: "עלייה חדה באימוץ כלי AI גנרטיבי בעסקים ישראליים",
    keywords: ["ChatGPT", "Claude", "Gemini", "אוטומציה"],
  },
  {
    id: 2,
    name: "אוטומציה עסקית",
    category: "תפעול",
    score: 82,
    growth: 28,
    direction: "up",
    description: "גידול בביקוש לפתרונות אוטומציה של תהליכים",
    keywords: ["RPA", "תהליכים", "יעילות", "חיסכון"],
  },
  {
    id: 3,
    name: "סייבר סקיוריטי",
    category: "אבטחה",
    score: 78,
    growth: 5,
    direction: "stable",
    description: "ביקוש יציב לפתרונות אבטחת מידע",
    keywords: ["אבטחה", "פרטיות", "GDPR", "סיכונים"],
  },
  {
    id: 4,
    name: "פינטק",
    category: "פיננסים",
    score: 71,
    growth: -8,
    direction: "down",
    description: "ירידה קלה בהשקעות בסטארטאפי פינטק",
    keywords: ["תשלומים", "בנקאות", "קריפטו", "השקעות"],
  },
]

const chartData = [
  { name: "AI גנרטיבי", score: 95 },
  { name: "אוטומציה", score: 82 },
  { name: "סייבר", score: 78 },
  { name: "פינטק", score: 71 },
  { name: "HealthTech", score: 65 },
  { name: "CleanTech", score: 58 },
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

function getGrowthColor(growth: number) {
  if (growth > 0) return "text-green-500"
  if (growth < 0) return "text-red-500"
  return "text-yellow-500"
}

export default function TrendsPage() {
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
                <YAxis dataKey="name" type="category" width={80} stroke="#8b9dc3" />
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
                  <span className={`text-lg font-bold ${getGrowthColor(trend.growth)}`}>
                    {trend.growth > 0 ? "+" : ""}{trend.growth}%
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

              <div className="flex flex-wrap gap-2">
                {trend.keywords.map((keyword) => (
                  <Badge
                    key={keyword}
                    variant="secondary"
                    className="bg-primary/10 text-primary"
                  >
                    {keyword}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
