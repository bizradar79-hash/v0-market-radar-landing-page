"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { 
  Target, 
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  AlertTriangle,
  Eye,
  Loader2,
  Activity,
} from "lucide-react"

interface Competitor {
  id: string
  name: string
  activity_type: string
  change_description: string
  impact: string
  services: string
  pricing: string
  position: string
  threat_score: number
  trend: string
  detected_at: string
  created_at: string
}

export default function CompetitorsPage() {
  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCompetitor, setSelectedCompetitor] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    fetchCompetitors()
  }, [])

  async function fetchCompetitors() {
    const { data, error } = await supabase
      .from("competitors")
      .select("*")
      .order("threat_score", { ascending: false })

    if (!error && data) {
      setCompetitors(data)
    }
    setLoading(false)
  }

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "up":
        return <TrendingUp className="h-4 w-4 text-red-400" />
      case "down":
        return <TrendingDown className="h-4 w-4 text-green-400" />
      default:
        return <Minus className="h-4 w-4 text-yellow-400" />
    }
  }

  const getTrendText = (trend: string) => {
    switch (trend) {
      case "up":
        return "עולה"
      case "down":
        return "יורד"
      default:
        return "יציב"
    }
  }

  const getThreatColor = (score: number) => {
    if (score >= 80) return "text-red-400"
    if (score >= 60) return "text-yellow-400"
    return "text-green-400"
  }

  const getThreatProgressColor = (score: number) => {
    if (score >= 80) return "[&>div]:bg-red-500"
    if (score >= 60) return "[&>div]:bg-yellow-500"
    return "[&>div]:bg-green-500"
  }

  const getPositionBadge = (position: string) => {
    switch (position) {
      case "מוביל שוק":
        return "bg-red-500/20 text-red-400 border-red-500/30"
      case "מתחרה ישיר":
        return "bg-orange-500/20 text-orange-400 border-orange-500/30"
      case "שחקן חדש":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30"
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/30"
    }
  }

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60))
    
    if (diffHours < 1) return "לפני פחות משעה"
    if (diffHours < 24) return `לפני ${diffHours} שעות`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays === 1) return "לפני יום"
    return `לפני ${diffDays} ימים`
  }

  const getActivityTypeIcon = (type: string) => {
    switch (type) {
      case "השקת מוצר":
        return "bg-purple-500/20 text-purple-400"
      case "שינוי מחירים":
        return "bg-yellow-500/20 text-yellow-400"
      case "גיוס הון":
        return "bg-green-500/20 text-green-400"
      default:
        return "bg-gray-500/20 text-gray-400"
    }
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
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">מתחרים</h1>
          <p className="text-muted-foreground">
            {competitors.length} מתחרים במעקב
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <span className="text-muted-foreground">
            {competitors.filter(c => c.threat_score >= 80).length} מתחרים ברמת איום גבוהה
          </span>
        </div>
      </div>

      {/* Comparison Table */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Target className="h-5 w-5 text-primary" />
            טבלת השוואה
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-right">שם</TableHead>
                  <TableHead className="text-right hidden md:table-cell">שירותים</TableHead>
                  <TableHead className="text-right hidden lg:table-cell">מחירון</TableHead>
                  <TableHead className="text-right">פוזיציה</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">פעילות אחרונה</TableHead>
                  <TableHead className="text-right">ציון איום</TableHead>
                  <TableHead className="text-right">מגמה</TableHead>
                  <TableHead className="text-right">פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {competitors.map((competitor) => (
                  <TableRow 
                    key={competitor.id} 
                    className={`border-border cursor-pointer transition-colors ${
                      selectedCompetitor === competitor.id ? "bg-primary/5" : ""
                    }`}
                    onClick={() => setSelectedCompetitor(
                      selectedCompetitor === competitor.id ? null : competitor.id
                    )}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                          <Target className="h-4 w-4 text-primary" />
                        </div>
                        <span className="font-medium text-foreground">{competitor.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-sm text-muted-foreground">
                        {competitor.services || "לא ידוע"}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-sm text-muted-foreground">
                        {competitor.pricing || "לא ידוע"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getPositionBadge(competitor.position || "לא ידוע")}>
                        {competitor.position || "לא ידוע"}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {formatTimeAgo(competitor.detected_at)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="w-24 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className={`text-sm font-semibold ${getThreatColor(competitor.threat_score)}`}>
                            {competitor.threat_score}
                          </span>
                        </div>
                        <Progress 
                          value={competitor.threat_score} 
                          className={`h-1.5 ${getThreatProgressColor(competitor.threat_score)}`} 
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {getTrendIcon(competitor.trend)}
                        <span className="text-xs text-muted-foreground">
                          {getTrendText(competitor.trend)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Activity Feed */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="h-5 w-5 text-primary" />
            פעילות אחרונה של מתחרים
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {competitors.map((competitor) => (
              <div 
                key={competitor.id}
                className="flex items-start gap-4 rounded-lg border border-border bg-secondary/20 p-4 transition-colors hover:bg-secondary/40"
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${getActivityTypeIcon(competitor.activity_type)}`}>
                  <Activity className="h-5 w-5" />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{competitor.name}</span>
                    <Badge variant="secondary" className="bg-secondary/50 text-xs">
                      {competitor.activity_type}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {competitor.change_description}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatTimeAgo(competitor.detected_at)}
                    </span>
                    <Badge 
                      variant="outline" 
                      className={
                        competitor.impact === "גבוה" 
                          ? "border-red-500/30 text-red-400" 
                          : "border-yellow-500/30 text-yellow-400"
                      }
                    >
                      השפעה: {competitor.impact}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {getTrendIcon(competitor.trend)}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {competitors.length === 0 && (
        <Card className="border-border bg-card">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Target className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">לא נמצאו מתחרים במעקב</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
