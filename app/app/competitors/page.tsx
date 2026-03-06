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

export default function CompetitorsPage() {
  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [loading, setLoading] = useState(true)
  const [discovering, setDiscovering] = useState(false)
  const [selectedCompetitor, setSelectedCompetitor] = useState<Competitor | null>(null)
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

  async function deleteCompetitor(id: string) {
    const { error } = await supabase
      .from("competitors")
      .delete()
      .eq("id", id)
    
    if (!error) {
      setCompetitors(competitors.filter(c => c.id !== id))
      setSelectedCompetitor(null)
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
                          <DropdownMenuItem onClick={() => setSelectedCompetitor(competitor)}>
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
                  className="flex items-start gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50"
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
                      {competitor.last_activity || "אין פעילות אחרונה"}
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
                  <div className="flex items-center gap-1">
                    {getTrendIcon(competitor.trend)}
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

      {/* Competitor Details Modal */}
      <Dialog open={!!selectedCompetitor} onOpenChange={() => setSelectedCompetitor(null)}>
        <DialogContent className="max-w-lg">
          {selectedCompetitor && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Target className="h-5 w-5 text-primary" />
                  </div>
                  {selectedCompetitor.name}
                </DialogTitle>
              </DialogHeader>
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
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
