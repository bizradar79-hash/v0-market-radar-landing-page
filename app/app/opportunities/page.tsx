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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { 
  Lightbulb, 
  ArrowUpDown, 
  Calendar, 
  Target,
  ExternalLink,
  Loader2,
  Filter,
  CheckCircle2,
  TrendingUp,
  Users,
  Globe,
  X,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

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
  const [analyzing, setAnalyzing] = useState(false)
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [priorityFilter, setPriorityFilter] = useState<string>("all")
  const [minScore, setMinScore] = useState<number>(0)
  const [sortBy, setSortBy] = useState<SortOption>("score")
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null)
  const supabase = createClient()
  const { toast } = useToast()

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

  async function analyzeWithAI() {
    setAnalyzing(true)
    try {
      const response = await fetch("/api/analyze", { method: "POST" })
      const data = await response.json()
      
      if (data.success) {
        await fetchOpportunities()
        toast({
          title: "ניתוח הושלם!",
          description: `נמצאו ${data.count || 0} הזदמנויות חדשות`,
        })
      } else if (data.throttled) {
        toast({
          title: "יש להמתין",
          description: data.error,
          variant: "destructive",
        })
      } else {
        toast({
          title: "לא נמצאו הזדמנויות",
          description: data.error || "נסה לעדכן את פרטי החברה בהגדרות",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error analyzing:", error)
      toast({
        title: "שגיאה",
        description: "אירעה שגיאה בעת הניתוח",
        variant: "destructive",
      })
    } finally {
      setAnalyzing(false)
    }
  }

  async function deleteOpportunity(id: string) {
    const { error } = await supabase
      .from("opportunities")
      .delete()
      .eq("id", id)
    
    if (!error) {
      setOpportunities(opportunities.filter(o => o.id !== id))
      setSelectedOpportunity(null)
      toast({ title: "ההזדמנות נמחקה" })
    }
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
        return "bg-red-100 text-red-700 border-red-200"
      case "גבוהה":
        return "bg-orange-100 text-orange-700 border-orange-200"
      case "בינונית":
        return "bg-yellow-100 text-yellow-700 border-yellow-200"
      default:
        return "bg-gray-100 text-gray-700 border-gray-200"
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "שוק לא מנוצל":
        return <Globe className="h-4 w-4" />
      case "שיתוף פעולה":
        return <Users className="h-4 w-4" />
      case "צמיחה":
        return <TrendingUp className="h-4 w-4" />
      default:
        return <Target className="h-4 w-4" />
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
        <Button 
          onClick={analyzeWithAI} 
          disabled={analyzing}
        >
          {analyzing ? (
            <>
              <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              מנתח את השוק...
            </>
          ) : (
            <>
              <Lightbulb className="ml-2 h-4 w-4" />
              נתח הזדמנויות עם AI
            </>
          )}
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">סינון:</span>
            </div>
            
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-40">
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
              <SelectTrigger className="w-40">
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
                <SelectTrigger className="w-32">
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
          <Card 
            key={opportunity.id} 
            className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50"
            onClick={() => setSelectedOpportunity(opportunity)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Lightbulb className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base leading-tight">{opportunity.title}</CardTitle>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
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
              <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                {opportunity.description}
              </p>

              {/* Scores */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">ציון השפעה</span>
                    <span className="font-semibold text-primary">{opportunity.impact_score}</span>
                  </div>
                  <Progress value={opportunity.impact_score} className="h-2" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">רמת ביטחון</span>
                    <span className="font-semibold">{opportunity.confidence_score}%</span>
                  </div>
                  <Progress value={opportunity.confidence_score} className="h-2" />
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-t pt-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  {formatDate(opportunity.created_at)}
                </div>
                <Button variant="ghost" size="sm" className="h-8 text-primary">
                  <ExternalLink className="ml-1 h-3.5 w-3.5" />
                  פרטים
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredOpportunities.length === 0 && (
        <Card>
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

      {/* Opportunity Details Modal */}
      <Dialog open={!!selectedOpportunity} onOpenChange={() => setSelectedOpportunity(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedOpportunity && (
            <>
              <DialogHeader>
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    {getTypeIcon(selectedOpportunity.type)}
                  </div>
                  <div className="flex-1">
                    <DialogTitle className="text-xl">{selectedOpportunity.title}</DialogTitle>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge variant="secondary">{selectedOpportunity.type}</Badge>
                      <Badge variant="outline" className={getPriorityColor(selectedOpportunity.priority)}>
                        {selectedOpportunity.priority}
                      </Badge>
                    </div>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-6 mt-4">
                {/* Description */}
                <div>
                  <h4 className="text-sm font-medium text-foreground mb-2">תיאור ההזדמנות</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {selectedOpportunity.description}
                  </p>
                </div>

                {/* Scores */}
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">ציון השפעה</span>
                      <span className="text-2xl font-bold text-primary">{selectedOpportunity.impact_score}</span>
                    </div>
                    <Progress value={selectedOpportunity.impact_score} className="h-3" />
                    <p className="text-xs text-muted-foreground">
                      פוטנציאל ההשפעה על העסק שלך
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">רמת ביטחון</span>
                      <span className="text-2xl font-bold">{selectedOpportunity.confidence_score}%</span>
                    </div>
                    <Progress value={selectedOpportunity.confidence_score} className="h-3" />
                    <p className="text-xs text-muted-foreground">
                      רמת הביטחון בניתוח
                    </p>
                  </div>
                </div>

                {/* Actions */}
                {selectedOpportunity.actions && selectedOpportunity.actions.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-3">פעולות מומלצות</h4>
                    <div className="space-y-2">
                      {selectedOpportunity.actions.map((action, idx) => (
                        <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                          <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                          <span className="text-sm">{action}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sources */}
                {selectedOpportunity.sources && selectedOpportunity.sources.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-2">מקורות</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedOpportunity.sources.map((source, idx) => (
                        <Badge key={idx} variant="outline">{source}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between pt-4 border-t">
                  <span className="text-sm text-muted-foreground">
                    נוצר ב-{formatDate(selectedOpportunity.created_at)}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteOpportunity(selectedOpportunity.id)}
                    >
                      <X className="ml-1 h-4 w-4" />
                      מחק
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
