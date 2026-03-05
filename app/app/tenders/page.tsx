"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { 
  FileText, 
  Building2,
  Calendar,
  Clock,
  Banknote,
  Target,
  ExternalLink,
  Loader2,
  AlertTriangle,
} from "lucide-react"

interface Tender {
  id: string
  title: string
  organization: string
  deadline: string
  estimated_value: string
  category: string
  status: string
  description: string
  relevance_score: number
  url: string
  created_at: string
}

export default function TendersPage() {
  const [tenders, setTenders] = useState<Tender[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    fetchTenders()
  }, [])

  async function fetchTenders() {
    const { data, error } = await supabase
      .from("tenders")
      .select("*")
      .order("deadline", { ascending: true })

    if (!error && data) {
      setTenders(data)
    }
    setLoading(false)
  }

  const getDaysUntilDeadline = (deadline: string) => {
    const now = new Date()
    const deadlineDate = new Date(deadline)
    const diffTime = deadlineDate.getTime() - now.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
  }

  const formatDeadline = (deadline: string) => {
    return new Date(deadline).toLocaleDateString("he-IL", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })
  }

  const getDeadlineStatus = (deadline: string) => {
    const days = getDaysUntilDeadline(deadline)
    if (days < 0) return { text: "פג תוקף", color: "text-gray-500", urgent: false }
    if (days <= 7) return { text: `${days} ימים`, color: "text-red-400", urgent: true }
    if (days <= 14) return { text: `${days} ימים`, color: "text-yellow-400", urgent: false }
    return { text: `${days} ימים`, color: "text-green-400", urgent: false }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "טכנולוגיה":
        return "bg-blue-500/20 text-blue-400"
      case "AI":
        return "bg-purple-500/20 text-purple-400"
      case "סייבר":
        return "bg-red-500/20 text-red-400"
      default:
        return "bg-gray-500/20 text-gray-400"
    }
  }

  const getRelevanceColor = (score: number) => {
    if (score >= 90) return "[&>div]:bg-green-500"
    if (score >= 70) return "[&>div]:bg-yellow-500"
    return "[&>div]:bg-gray-500"
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
          <h1 className="text-2xl font-bold text-foreground">מכרזים</h1>
          <p className="text-muted-foreground">
            {tenders.length} מכרזים פעילים
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <span className="text-muted-foreground">
            {tenders.filter(t => getDaysUntilDeadline(t.deadline) <= 7 && getDaysUntilDeadline(t.deadline) >= 0).length} מכרזים עם דדליין קרוב
          </span>
        </div>
      </div>

      {/* Tenders Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {tenders.map((tender) => {
          const deadlineStatus = getDeadlineStatus(tender.deadline)
          
          return (
            <Card 
              key={tender.id} 
              className={`border-border bg-card transition-all hover:border-primary/50 ${
                deadlineStatus.urgent ? "border-red-500/50" : ""
              }`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <Badge variant="outline" className={getCategoryColor(tender.category)}>
                    {tender.category}
                  </Badge>
                  {deadlineStatus.urgent && (
                    <Badge variant="destructive" className="bg-red-500/20 text-red-400">
                      <AlertTriangle className="ml-1 h-3 w-3" />
                      דחוף
                    </Badge>
                  )}
                </div>
                <CardTitle className="mt-2 text-base leading-tight">
                  {tender.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Organization */}
                <div className="flex items-center gap-2 text-sm">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-foreground">{tender.organization}</span>
                </div>

                {/* Description */}
                <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                  {tender.description}
                </p>

                {/* Budget */}
                <div className="flex items-center gap-2 rounded-lg bg-secondary/30 p-3">
                  <Banknote className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-xs text-muted-foreground">תקציב משוער</p>
                    <p className="font-semibold text-foreground">{tender.estimated_value}</p>
                  </div>
                </div>

                {/* Relevance Score */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Target className="h-3.5 w-3.5" />
                      ציון רלוונטיות
                    </span>
                    <span className="font-semibold text-primary">{tender.relevance_score}%</span>
                  </div>
                  <Progress 
                    value={tender.relevance_score} 
                    className={`h-2 ${getRelevanceColor(tender.relevance_score)}`} 
                  />
                </div>

                {/* Deadline */}
                <div className={`flex items-center justify-between rounded-lg p-3 ${
                  deadlineStatus.urgent ? "bg-red-500/10" : "bg-secondary/30"
                }`}>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">תאריך אחרון להגשה</p>
                      <p className="text-sm font-medium text-foreground">
                        {formatDeadline(tender.deadline)}
                      </p>
                    </div>
                  </div>
                  <div className="text-left">
                    <div className={`flex items-center gap-1 text-sm font-semibold ${deadlineStatus.color}`}>
                      <Clock className="h-3.5 w-3.5" />
                      {deadlineStatus.text}
                    </div>
                  </div>
                </div>

                {/* Action Button */}
                <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
                  <ExternalLink className="ml-2 h-4 w-4" />
                  הגש הצעה
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {tenders.length === 0 && (
        <Card className="border-border bg-card">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">לא נמצאו מכרזים פעילים</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
