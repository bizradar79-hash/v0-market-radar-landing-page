"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { 
  Lightbulb, 
  ArrowUpDown, 
  Calendar, 
  Target,
  ExternalLink,
  Loader2,
  Filter,
} from "lucide-react"

interface Opportunity {
  id: string
  company_id: string
  title: string
  description: string
  impact_score: number
  confidence_score: number
  priority: string
  type: string
  actions: string[]
  sources: string[]
  created_at: string
}

type SortOption = "score" | "date" | "priority"

export default function OpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [priorityFilter, setPriorityFilter] = useState<string>("all")
  const [minScore, setMinScore] = useState<number>(0)
  const [sortBy, setSortBy] = useState<SortOption>("score")
  const supabase = createClient()

  useEffect(() => {
    fetchOpportunities()
  }, [])

  async function fetchOpportunities() {
    const { data, error } = await supabase
      .from("opportunities")
      .select("*")
      .order("created_at", { ascending: false })

    if (!error && data) {
      setOpportunities(data)
    }
    setLoading(false)
  }

  const filteredOpportunities = opportunities
    .filter((opp) => {
      if (typeFilter !== "all" && opp.type !== typeFilter) return false
      if (priorityFilter !== "all" && opp.priority !== priorityFilter) return false
      if (opp.impact_score < minScore) return false
      return true
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "score":
          return b.impact_score - a.impact_score
        case "date":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        case "priority":
          const priorityOrder = { "דחופה": 0, "גבוהה": 1, "בינונית": 2, "נמוכה": 3 }
          return (priorityOrder[a.priority as keyof typeof priorityOrder] || 3) - 
                 (priorityOrder[b.priority as keyof typeof priorityOrder] || 3)
        default:
          return 0
      }
    })

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "דחופה":
        return "bg-red-500/20 text-red-400 border-red-500/30"
      case "גבוהה":
        return "bg-orange-500/20 text-orange-400 border-orange-500/30"
      case "בינונית":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/30"
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case "טכנולוגיה":
        return "bg-blue-500/20 text-blue-400"
      case "שותפות":
        return "bg-purple-500/20 text-purple-400"
      case "בריאות":
        return "bg-green-500/20 text-green-400"
      case "שוק":
        return "bg-cyan-500/20 text-cyan-400"
      default:
        return "bg-gray-500/20 text-gray-400"
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("he-IL", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  }

  const uniqueTypes = [...new Set(opportunities.map((o) => o.type))]
  const uniquePriorities = [...new Set(opportunities.map((o) => o.priority))]

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
          <h1 className="text-2xl font-bold text-foreground">הזדמנויות</h1>
          <p className="text-muted-foreground">
            {filteredOpportunities.length} הזדמנויות נמצאו
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card className="border-border bg-card">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">סינון:</span>
            </div>
            
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-40 bg-secondary/50">
                <SelectValue placeholder="סוג הזדמנות" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל הסוגים</SelectItem>
                {uniqueTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-40 bg-secondary/50">
                <SelectValue placeholder="עדיפות" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל העדיפויות</SelectItem>
                {uniquePriorities.map((priority) => (
                  <SelectItem key={priority} value={priority}>
                    {priority}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">ציון מינימלי: {minScore}</span>
              <Slider
                value={[minScore]}
                onValueChange={(v) => setMinScore(v[0])}
                max={100}
                step={5}
                className="w-32"
              />
            </div>

            <div className="mr-auto flex items-center gap-2">
              <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                <SelectTrigger className="w-32 bg-secondary/50">
                  <SelectValue placeholder="מיון" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="score">ציון</SelectItem>
                  <SelectItem value="date">תאריך</SelectItem>
                  <SelectItem value="priority">עדיפות</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Opportunities Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {filteredOpportunities.map((opportunity) => (
          <Card key={opportunity.id} className="border-border bg-card transition-all hover:border-primary/50">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Lightbulb className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base leading-tight">{opportunity.title}</CardTitle>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge variant="outline" className={getTypeColor(opportunity.type)}>
                        {opportunity.type}
                      </Badge>
                      <Badge variant="outline" className={getPriorityColor(opportunity.priority)}>
                        {opportunity.priority}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                {opportunity.description}
              </p>

              {/* Scores */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">ציון השפעה</span>
                    <span className="font-semibold text-primary">{opportunity.impact_score}/100</span>
                  </div>
                  <Progress value={opportunity.impact_score} className="h-2" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">רמת ביטחון</span>
                    <span className="font-semibold text-foreground">{opportunity.confidence_score}%</span>
                  </div>
                  <Progress value={opportunity.confidence_score} className="h-2 [&>div]:bg-blue-500" />
                </div>
              </div>

              {/* Recommended Actions */}
              {opportunity.actions && opportunity.actions.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-medium text-muted-foreground">פעולות מומלצות:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {opportunity.actions.slice(0, 3).map((action, idx) => (
                      <Badge 
                        key={idx} 
                        variant="secondary" 
                        className="bg-secondary/50 text-xs font-normal"
                      >
                        {action}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-border pt-3">
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Target className="h-3.5 w-3.5" />
                    {opportunity.type}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatDate(opportunity.created_at)}
                  </span>
                </div>
                <Button variant="ghost" size="sm" className="h-8 text-primary hover:text-primary">
                  <ExternalLink className="ml-1 h-3.5 w-3.5" />
                  פרטים
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredOpportunities.length === 0 && (
        <Card className="border-border bg-card">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Lightbulb className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">לא נמצאו הזדמנויות מתאימות</p>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => {
                setTypeFilter("all")
                setPriorityFilter("all")
                setMinScore(0)
              }}
            >
              נקה סינונים
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
