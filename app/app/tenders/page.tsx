"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  Sparkles,
  Trash2,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface Tender {
  id: string
  company_id: string
  title: string
  organization: string
  deadline: string
  budget: string
  description: string
  link: string
  relevance_score: number
  created_at: string
}

export default function TendersPage() {
  const [tenders, setTenders] = useState<Tender[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [selectedTender, setSelectedTender] = useState<Tender | null>(null)
  const supabase = createClient()
  const { toast } = useToast()

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

  async function generateTenders() {
    setGenerating(true)
    try {
      const response = await fetch("/api/generate-tenders", { method: "POST" })
      const data = await response.json()
      
      if (data.success) {
        await fetchTenders()
        toast({
          title: "מכרזים נוספו!",
          description: `נמצאו ${data.count || 0} מכרזים חדשים`,
        })
      } else {
        toast({
          title: "שגיאה",
          description: data.error || "לא הצלחנו לאתר מכרזים",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error generating tenders:", error)
      toast({
        title: "שגיאה",
        description: "אירעה שגיאה בעת איתור המכרזים",
        variant: "destructive",
      })
    } finally {
      setGenerating(false)
    }
  }

  async function deleteTender(id: string) {
    const { error } = await supabase
      .from("tenders")
      .delete()
      .eq("id", id)
    
    if (!error) {
      setTenders(tenders.filter(t => t.id !== id))
      setSelectedTender(null)
      toast({ title: "המכרז נמחק" })
    }
  }

  const getDaysUntilDeadline = (deadline: string | null) => {
    if (!deadline) return null
    const deadlineDate = new Date(deadline)
    if (isNaN(deadlineDate.getTime())) return null
    const now = new Date()
    const diffTime = deadlineDate.getTime() - now.getTime()
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  const formatDeadline = (deadline: string | null) => {
    if (!deadline) return "לא צוין"
    const d = new Date(deadline)
    if (isNaN(d.getTime())) return "לא צוין"
    return d.toLocaleDateString("he-IL", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })
  }

  const getDeadlineStatus = (deadline: string | null) => {
    const days = getDaysUntilDeadline(deadline)
    if (days === null) return { text: "לא ידוע", color: "text-gray-400", urgent: false }
    if (days < 0) return { text: "סגור", color: "text-gray-500", urgent: false }
    if (days <= 7) return { text: `${days} ימים`, color: "text-red-600", urgent: true }
    if (days <= 14) return { text: `${days} ימים`, color: "text-yellow-600", urgent: false }
    return { text: `פתוח — ${days} ימים`, color: "text-green-600", urgent: false }
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
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <span className="text-muted-foreground">
              {tenders.filter(t => { const d = getDaysUntilDeadline(t.deadline); return d !== null && d <= 7 && d >= 0 }).length} עם דדליין קרוב
            </span>
          </div>
          <Button onClick={generateTenders} disabled={generating}>
            {generating ? (
              <>
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                מחפש מכרזים...
              </>
            ) : (
              <>
                <Sparkles className="ml-2 h-4 w-4" />
                חפש מכרזים עם AI
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Tenders Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {tenders.map((tender) => {
          const deadlineStatus = getDeadlineStatus(tender.deadline)
          
          return (
            <Card 
              key={tender.id} 
              className={`cursor-pointer transition-all hover:shadow-md ${
                deadlineStatus.urgent ? "border-red-200" : ""
              }`}
              onClick={() => setSelectedTender(tender)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <Badge variant="secondary">מכרז</Badge>
                  {deadlineStatus.urgent && (
                    <Badge variant="destructive" className="bg-red-100 text-red-700">
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
                  <span>{tender.organization}</span>
                </div>

                {/* Description */}
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {tender.description}
                </p>

                {/* Budget */}
                <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
                  <Banknote className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-xs text-muted-foreground">תקציב משוער</p>
                    <p className="font-semibold">{tender.budget}</p>
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
                  <Progress value={tender.relevance_score} className="h-2" />
                </div>

                {/* Deadline */}
                <div className={`flex items-center justify-between rounded-lg p-3 ${
                  deadlineStatus.urgent ? "bg-red-50" : "bg-muted/50"
                }`}>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">תאריך אחרון</p>
                      <p className="text-sm font-medium">
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
                <Button className="w-full" onClick={(e) => { e.stopPropagation(); }}>
                  <ExternalLink className="ml-2 h-4 w-4" />
                  הגש הצעה
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {tenders.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">לא נמצאו מכרזים פעילים</p>
            <Button className="mt-4" onClick={generateTenders} disabled={generating}>
              <Sparkles className="ml-2 h-4 w-4" />
              חפש מכרזים עם AI
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tender Details Modal */}
      <Dialog open={!!selectedTender} onOpenChange={() => setSelectedTender(null)}>
        <DialogContent className="max-w-lg">
          {selectedTender && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedTender.title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{selectedTender.organization}</span>
                </div>
                
                <p className="text-muted-foreground">{selectedTender.description}</p>

                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">תקציב משוער</p>
                    <p className="font-semibold text-lg">{selectedTender.budget}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">ציון רלוונטיות</p>
                    <p className="font-semibold text-lg text-primary">{selectedTender.relevance_score}%</p>
                  </div>
                </div>

                <div className={`rounded-lg p-3 ${
                  getDeadlineStatus(selectedTender.deadline).urgent ? "bg-red-50" : "bg-muted/50"
                }`}>
                  <p className="text-xs text-muted-foreground">תאריך אחרון להגשה</p>
                  <p className="font-semibold">{formatDeadline(selectedTender.deadline)}</p>
                  <p className={`text-sm ${getDeadlineStatus(selectedTender.deadline).color}`}>
                    {getDeadlineStatus(selectedTender.deadline).text}
                  </p>
                </div>

                <div className="flex gap-2 pt-4 border-t">
                  <Button className="flex-1">
                    <ExternalLink className="ml-2 h-4 w-4" />
                    הגש הצעה
                  </Button>
                  <Button 
                    variant="outline" 
                    className="text-red-600"
                    onClick={() => deleteTender(selectedTender.id)}
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
