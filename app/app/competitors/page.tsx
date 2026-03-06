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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { 
  Target, 
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  AlertTriangle,
  Loader2,
  Activity,
  Sparkles,
  MoreHorizontal,
  Eye,
  Trash2,
  ExternalLink,
  Brain,
  CheckCircle2,
  XCircle,
  Lightbulb,
  ShieldAlert,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface Competitor {
  id: string
  company_id: string
  name: string
  website: string
  services: string
  pricing: string
  positioning: string
  last_activity: string
  threat_score: number
  trend: string
  created_at: string
}

interface CompetitorAnalysis {
  overview: string
  products: string[]
  pricing: string
  strengths: string[]
  weaknesses: string[]
  positioning: string
  threatLevel: string
  opportunities: string[]
  recommendations: string[]
}

export default function CompetitorsPage() {
  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [loading, setLoading] = useState(true)
  const [discovering, setDiscovering] = useState(false)
  const [selectedCompetitor, setSelectedCompetitor] = useState<Competitor | null>(null)
  const [analyzing, setAnalyzing] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<CompetitorAnalysis | null>(null)
  const [showAnalysisModal, setShowAnalysisModal] = useState(false)
  const supabase = createClient()
  const { toast } = useToast()

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

  async function discoverCompetitors() {
    setDiscovering(true)
    try {
      const response = await fetch("/api/find-competitors", { method: "POST" })
      const data = await response.json()
      
      if (data.success) {
        await fetchCompetitors()
        toast({
          title: "גילוי הושלם!",
          description: `נמצאו ${data.count || 0} מתחרים חדשים`,
        })
      } else {
        toast({
          title: "שגיאה",
          description: data.error || "לא הצלחנו לגלות מתחרים",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error discovering competitors:", error)
      toast({
        title: "שגיאה",
        description: "אירעה שגיאה בעת הגילוי",
        variant: "destructive",
      })
    } finally {
      setDiscovering(false)
    }
  }

  async function analyzeCompetitor(competitor: Competitor) {
    setAnalyzing(competitor.id)
    setAnalysis(null)
    setSelectedCompetitor(competitor)
    setShowAnalysisModal(true)
    
    try {
      const response = await fetch("/api/analyze-competitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          competitorId: competitor.id,
          competitorName: competitor.name,
          competitorWebsite: competitor.website,
        }),
      })
      
      const data = await response.json()
      
      if (data.success) {
        setAnalysis(data.analysis)
        // Refresh competitors to get updated threat score
        await fetchCompetitors()
        toast({
          title: "ניתוח הושלם!",
          description: `הניתוח של ${competitor.name} מוכן`,
        })
      } else {
        toast({
          title: "שגיאה בניתוח",
          description: data.error || "לא הצלחנו לנתח את המתחרה",
          variant: "destructive",
        })
        setShowAnalysisModal(false)
      }
    } catch (error) {
      console.error("Error analyzing competitor:", error)
      toast({
        title: "שגיאה",
        description: "אירעה שגיאה בעת הניתוח",
        variant: "destructive",
      })
      setShowAnalysisModal(false)
    } finally {
      setAnalyzing(null)
    }
  }

  async function deleteCompetitor(id: string) {
    const { error } = await supabase
      .from("competitors")
      .delete()
      .eq("id", id)
    
    if (!error) {
      setCompetitors(competitors.filter(c => c.id !== id))
      setSelectedCompetitor(null)
      setShowAnalysisModal(false)
      toast({ title: "המתחרה נמחק" })
    }
  }

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "up":
        return <TrendingUp className="h-4 w-4 text-red-600" />
      case "down":
        return <TrendingDown className="h-4 w-4 text-green-600" />
      default:
        return <Minus className="h-4 w-4 text-yellow-600" />
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
    if (score >= 80) return "text-red-600"
    if (score >= 60) return "text-yellow-600"
    return "text-green-600"
  }

  const getPositionBadge = (position: string) => {
    switch (position) {
      case "מוביל שוק":
        return "bg-red-100 text-red-700 border-red-200"
      case "מתחרה ישיר":
        return "bg-orange-100 text-orange-700 border-orange-200"
      case "שחקן חדש":
        return "bg-blue-100 text-blue-700 border-blue-200"
      default:
        return "bg-gray-100 text-gray-700 border-gray-200"
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
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <span className="text-muted-foreground">
              {competitors.filter(c => c.threat_score >= 80).length} ברמת איום גבוהה
            </span>
          </div>
          <Button onClick={discoverCompetitors} disabled={discovering}>
            {discovering ? (
              <>
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                מגלה מתחרים...
              </>
            ) : (
              <>
                <Sparkles className="ml-2 h-4 w-4" />
                גלה מתחרים עם AI
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Comparison Table */}
      <Card>
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
                <TableRow>
                  <TableHead className="text-right">שם</TableHead>
                  <TableHead className="text-right hidden md:table-cell">שירותים</TableHead>
                  <TableHead className="text-right hidden lg:table-cell">מחירון</TableHead>
                  <TableHead className="text-right">פוזיציה</TableHead>
                  <TableHead className="text-right">ציון איום</TableHead>
                  <TableHead className="text-right">מגמה</TableHead>
                  <TableHead className="text-right">פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {competitors.map((competitor) => (
                  <TableRow key={competitor.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                          <Target className="h-4 w-4 text-primary" />
                        </div>
                        <span className="font-medium">{competitor.name}</span>
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
                      <Badge variant="outline" className={getPositionBadge(competitor.positioning || "לא ידוע")}>
                        {competitor.positioning || "לא ידוע"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="w-24 space-y-1">
                        <span className={`text-sm font-semibold ${getThreatColor(competitor.threat_score)}`}>
                          {competitor.threat_score}
                        </span>
                        <Progress value={competitor.threat_score} className="h-1.5" />
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => analyzeCompetitor(competitor)}>
                            <Brain className="ml-2 h-4 w-4" />
                            נתח עם AI
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            setSelectedCompetitor(competitor)
                            setAnalysis(null)
                            setShowAnalysisModal(true)
                          }}>
                            <Eye className="ml-2 h-4 w-4" />
                            צפה בפרטים
                          </DropdownMenuItem>
                          {competitor.website && (
                            <DropdownMenuItem asChild>
                              <a href={competitor.website.startsWith('http') ? competitor.website : `https://${competitor.website}`} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="ml-2 h-4 w-4" />
                                פתח אתר
                              </a>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem 
                            onClick={() => deleteCompetitor(competitor.id)}
                            className="text-red-600"
                          >
                            <Trash2 className="ml-2 h-4 w-4" />
                            מחק
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Activity Feed */}
      {competitors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="h-5 w-5 text-primary" />
              פעילות אחרונה של מתחרים
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {competitors.slice(0, 5).map((competitor) => (
                <div 
                  key={competitor.id}
                  className="flex items-start gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50 cursor-pointer"
                  onClick={() => analyzeCompetitor(competitor)}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Activity className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{competitor.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {competitor.services || "לא ידוע"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {competitor.last_activity || "לחץ לניתוח עם AI"}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTimeAgo(competitor.created_at)}
                      </span>
                      <Badge 
                        variant="outline" 
                        className={
                          competitor.threat_score >= 80 
                            ? "border-red-200 text-red-600" 
                            : "border-yellow-200 text-yellow-600"
                        }
                      >
                        איום: {competitor.threat_score}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {analyzing === competitor.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : (
                      <>
                        {getTrendIcon(competitor.trend)}
                        <Brain className="h-4 w-4 text-muted-foreground" />
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {competitors.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Target className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">לא נמצאו מתחרים במעקב</p>
            <Button className="mt-4" onClick={discoverCompetitors} disabled={discovering}>
              <Sparkles className="ml-2 h-4 w-4" />
              גלה מתחרים עם AI
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Competitor Analysis Modal */}
      <Dialog open={showAnalysisModal} onOpenChange={(open) => {
        if (!open) {
          setShowAnalysisModal(false)
          setSelectedCompetitor(null)
          setAnalysis(null)
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedCompetitor && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Target className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    {selectedCompetitor.name}
                    {analysis && (
                      <Badge className="mr-2" variant={
                        analysis.threatLevel === "גבוה" ? "destructive" : 
                        analysis.threatLevel === "בינוני" ? "secondary" : "outline"
                      }>
                        רמת איום: {analysis.threatLevel}
                      </Badge>
                    )}
                  </div>
                </DialogTitle>
              </DialogHeader>
              
              {analyzing === selectedCompetitor.id ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                  <p className="text-muted-foreground">מנתח את {selectedCompetitor.name}...</p>
                  <p className="text-sm text-muted-foreground">זה עשוי לקחת מספר שניות</p>
                </div>
              ) : analysis ? (
                <div className="space-y-6 mt-4">
                  {/* Overview */}
                  <div className="rounded-lg bg-muted/50 p-4">
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <Eye className="h-4 w-4 text-primary" />
                      סקירה כללית
                    </h4>
                    <p className="text-sm text-muted-foreground">{analysis.overview}</p>
                  </div>

                  {/* Products & Pricing */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-lg border p-4">
                      <h4 className="font-semibold mb-2">מוצרים ושירותים</h4>
                      <ul className="space-y-1">
                        {analysis.products.map((product, i) => (
                          <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                            <span className="text-primary mt-1">•</span>
                            {product}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-lg border p-4">
                      <h4 className="font-semibold mb-2">תמחור</h4>
                      <p className="text-sm text-muted-foreground">{analysis.pricing}</p>
                      <div className="mt-3">
                        <h5 className="text-sm font-medium mb-1">מיצוב בשוק</h5>
                        <p className="text-sm text-muted-foreground">{analysis.positioning}</p>
                      </div>
                    </div>
                  </div>

                  {/* Strengths & Weaknesses */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-lg border border-green-200 bg-green-50/50 p-4">
                      <h4 className="font-semibold mb-2 flex items-center gap-2 text-green-700">
                        <CheckCircle2 className="h-4 w-4" />
                        חוזקות
                      </h4>
                      <ul className="space-y-1">
                        {analysis.strengths.map((strength, i) => (
                          <li key={i} className="text-sm text-green-700 flex items-start gap-2">
                            <span className="mt-1">•</span>
                            {strength}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-lg border border-red-200 bg-red-50/50 p-4">
                      <h4 className="font-semibold mb-2 flex items-center gap-2 text-red-700">
                        <XCircle className="h-4 w-4" />
                        חולשות
                      </h4>
                      <ul className="space-y-1">
                        {analysis.weaknesses.map((weakness, i) => (
                          <li key={i} className="text-sm text-red-700 flex items-start gap-2">
                            <span className="mt-1">•</span>
                            {weakness}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Opportunities */}
                  <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
                    <h4 className="font-semibold mb-2 flex items-center gap-2 text-blue-700">
                      <Lightbulb className="h-4 w-4" />
                      הזדמנויות מולם
                    </h4>
                    <ul className="space-y-1">
                      {analysis.opportunities.map((opp, i) => (
                        <li key={i} className="text-sm text-blue-700 flex items-start gap-2">
                          <span className="mt-1">•</span>
                          {opp}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Recommendations */}
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                    <h4 className="font-semibold mb-2 flex items-center gap-2 text-primary">
                      <ShieldAlert className="h-4 w-4" />
                      המלצות אסטרטגיות
                    </h4>
                    <ul className="space-y-2">
                      {analysis.recommendations.map((rec, i) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <span className="font-bold text-primary">{i + 1}.</span>
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-4 border-t">
                    {selectedCompetitor.website && (
                      <Button variant="outline" asChild>
                        <a href={selectedCompetitor.website.startsWith('http') ? selectedCompetitor.website : `https://${selectedCompetitor.website}`} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="ml-2 h-4 w-4" />
                          פתח אתר
                        </a>
                      </Button>
                    )}
                    <Button variant="outline" onClick={() => analyzeCompetitor(selectedCompetitor)}>
                      <Brain className="ml-2 h-4 w-4" />
                      נתח מחדש
                    </Button>
                  </div>
                </div>
              ) : (
                /* Basic Details View */
                <div className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">שירותים</p>
                      <p className="font-medium">{selectedCompetitor.services || "לא ידוע"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">תמחור</p>
                      <p className="font-medium">{selectedCompetitor.pricing || "לא ידוע"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">פוזיציה</p>
                      <Badge variant="outline" className={getPositionBadge(selectedCompetitor.positioning || "לא ידוע")}>
                        {selectedCompetitor.positioning || "לא ידוע"}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">ציון איום</p>
                      <p className={`font-bold text-lg ${getThreatColor(selectedCompetitor.threat_score)}`}>
                        {selectedCompetitor.threat_score}
                      </p>
                    </div>
                  </div>
                  {selectedCompetitor.last_activity && (
                    <div>
                      <p className="text-sm text-muted-foreground">פעילות אחרונה</p>
                      <p>{selectedCompetitor.last_activity}</p>
                    </div>
                  )}
                  
                  <div className="flex gap-2 pt-4 border-t">
                    <Button onClick={() => analyzeCompetitor(selectedCompetitor)}>
                      <Brain className="ml-2 h-4 w-4" />
                      נתח עם AI
                    </Button>
                    {selectedCompetitor.website && (
                      <Button variant="outline" asChild>
                        <a href={selectedCompetitor.website.startsWith('http') ? selectedCompetitor.website : `https://${selectedCompetitor.website}`} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="ml-2 h-4 w-4" />
                          פתח אתר
                        </a>
                      </Button>
                    )}
                    <Button 
                      variant="outline" 
                      className="text-red-600"
                      onClick={() => deleteCompetitor(selectedCompetitor.id)}
                    >
                      <Trash2 className="ml-2 h-4 w-4" />
                      מחק
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
