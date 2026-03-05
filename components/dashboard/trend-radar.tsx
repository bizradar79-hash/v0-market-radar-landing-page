"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from "recharts"

interface Trend {
  id: string
  name: string
  category: string
  score: number
  direction: string
  description: string
}

interface TrendRadarProps {
  trends: Trend[]
}

const COLORS = ["#00d4aa", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#ec4899"]

export function TrendRadar({ trends }: TrendRadarProps) {
  const chartData = trends.map((trend) => ({
    name: trend.name.length > 15 ? trend.name.substring(0, 15) + "..." : trend.name,
    fullName: trend.name,
    score: trend.score,
    direction: trend.direction,
  }))

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/20">
            <TrendingUp className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <CardTitle className="text-lg">רדאר טרנדים</CardTitle>
            <p className="text-sm text-muted-foreground">טרנדים מזוהים בשוק</p>
          </div>
        </div>
        <Button variant="ghost" className="text-primary hover:text-primary/80">
          צפה בכל
          <ArrowLeft className="w-4 h-4 mr-2" />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
            >
              <XAxis 
                type="number" 
                domain={[0, 100]} 
                tick={{ fill: "#8b9dc3", fontSize: 12 }}
                axisLine={{ stroke: "#1e3a5f" }}
                tickLine={{ stroke: "#1e3a5f" }}
              />
              <YAxis 
                type="category" 
                dataKey="name" 
                width={120}
                tick={{ fill: "#8b9dc3", fontSize: 12, textAnchor: "end" }}
                axisLine={{ stroke: "#1e3a5f" }}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0d1526",
                  border: "1px solid #1e3a5f",
                  borderRadius: "8px",
                  color: "#f0f4f8",
                }}
                formatter={(value: number, name: string, props: { payload: { fullName: string; direction: string } }) => [
                  `${value} - ${props.payload.direction === "עולה" ? "עולה" : props.payload.direction === "יציב" ? "יציב" : "יורד"}`,
                  props.payload.fullName,
                ]}
                labelStyle={{ color: "#f0f4f8" }}
              />
              <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {trends.slice(0, 4).map((trend, index) => (
            <div 
              key={trend.id} 
              className="flex items-center gap-2 text-xs"
            >
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: COLORS[index % COLORS.length] }} 
              />
              <span className="text-muted-foreground">{trend.category}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
