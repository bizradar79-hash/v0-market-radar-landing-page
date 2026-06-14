"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
  const [selectedTender, setSelectedTender] = useState<Tender | null>(null)
  const [savedTitles, setSavedTitles] = useState<Set<string>>(new Set())
  const supabase = createClient()
  const { toast } = useToast()

  useEffect(() => {
    fetchTenders()
    fetchSaved()
  }, [])

  async function fetchSaved() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('saved_items').select('title').eq('company_id', user.id).eq('item_type', 'tender')
    if (data) setSavedTitles(new Set(data.map((s: any) => s.title)))
  }

  async function fetchTenders() {
    const { data, error } = await supabase
      .from("tenders")
      .select("*")

    if (!error && data) {
      // Only show tenders with a real, working link; rank high-to-low by
      // relevance (tiebreak nearest deadline) so the best matches lead.
      const rows = data.filter((t: Tender) => /^https?:\/\//i.test((t.link || '').trim()))
      rows.sort((a: Tender, b: Tender) => {
        if ((b.relevance_score ?? 0) !== (a.relevance_score ?? 0)) return (b.relevance_score ?? 0) - (a.relevance_score ?? 0)
        if (!a.deadline && !b.deadline) return 0
        if (!a.deadline) return 1
        if (!b.deadline) return -1
        return a.deadline.localeCompare(b.deadline)
      })
      setTenders(rows)
    }
    setLoading(false)
  }

  async function saveTender(tender: Tender) {
    setSavedTitles(prev => new Set([...prev, tender.title]))
    try {
      await fetch('/api/saved-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_type: 'tender',
          item_id: tender.id,
          title: tender.title,
          description: tender.organization ? `ארגון: ${tender.organization}` : tender.description?.slice(0, 120),
          url: tender.link || null,
          source_module: 'מכרזים',
          metadata: { deadline: tender.deadline, budget: tender.budget, relevance_score: tender.relevance_score },
        }),
      })
      const win = window as any
      if (typeof win.refreshSidebarCounts === 'function') win.refreshSidebarCounts()
    } catch {}
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
    if (days === null) return { text: "לא ידוע", badge: "bg-gray-100 text-gray-500", color: "text-gray-400", urgent: false }
    if (days < 0) return { text: "סגור", badge: "bg-red-100 text-red-700", color: "text-red-600", urgent: false }
    if (days <= 7) return { text: `פתוח — ${days} ימים`, badge: "bg-green-100 text-green-700", color: "text-red-600", urgent: true }
    if (days <= 14) return { text: `פתוח — ${days} ימים`, badge: "bg-green-100 text-green-700", color: "text-yellow-600", urgent: false }
    return { text: `פתוח — ${days} ימים`, badge: "bg-green-100 text-green-700", color: "text-green-600", urgent: false }
  }

  const isBudgetKnown = (budget: string | null) =>
    !!budget && budget !== 'לא צוין' && budget !== 'not specified' && budget !== 'לא ידוע'

  const getTenderSource = (description: string | null): 'engine' | 'ai' => {
    if (description?.startsWith('[src:engine]')) return 'engine'
    return 'ai'
  }

  // Transparent match-quality band from the relevance %.
  const getMatchBand = (score: number) => {
    if (score >= 70) return { label: 'התאמה גבוהה', bar: 'bg-green-500', text: 'text-green-700', chip: 'bg-green-100 text-green-700' }
    if (score >= 40) return { label: 'התאמה בינונית', bar: 'bg-yellow-500', text: 'text-yellow-700', chip: 'bg-yellow-100 text-yellow-700' }
    return { label: 'התאמה נמוכה — ייתכן שרלוונטי', bar: 'bg-gray-400', text: 'text-gray-500', chip: 'bg-gray-100 text-gray-500' }
  }

  const cleanDesc = (text: string | null) => {
    if (!text) return ''
    const stripped = text.replace(/^\[src:(engine|ai)\]/, '')
    if (stripped.includes('0 obj') || stripped.includes('endobj') || stripped.includes('stream')) return ''
    if (stripped.includes('&#') || stripped.includes('&amp;')) return ''
    return stripped
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
                  <div className="flex items-center gap-1.5">
                    <Badge variant="secondary">מכרז</Badge>
                    {getTenderSource(tender.description) === 'engine' ? (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                        מאומת ✓
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                        AI
                      </span>
                    )}
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${deadlineStatus.badge}`}>
                    {deadlineStatus.text}
                  </span>
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
                {cleanDesc(tender.description) && (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {cleanDesc(tender.description)}
                  </p>
                )}

                {/* Budget — hidden if unknown */}
                {isBudgetKnown(tender.budget) && (
                  <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
                    <Banknote className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">תקציב משוער</p>
                      <p className="font-semibold">{tender.budget}</p>
                    </div>
                  </div>
                )}

                {/* Relevance Score — honest %, colored by match band */}
                {(() => {
                  const band = getMatchBand(tender.relevance_score)
                  return (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Target className="h-3.5 w-3.5" />
                          ציון רלוונטיות
                        </span>
                        <span className={`font-semibold ${band.text}`}>{tender.relevance_score}%</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div className={`h-full rounded-full ${band.bar}`} style={{ width: `${tender.relevance_score}%` }} />
                      </div>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${band.chip}`}>
                        {band.label}
                      </span>
                    </div>
                  )
                })()}

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

                {/* Action Buttons */}
                <div className="flex gap-2">
                  {tender.link && (
                    <a href={tender.link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="flex-1">
                      <Button className="w-full">
                        <ExternalLink className="ml-2 h-4 w-4" />
                        הגש הצעה
                      </Button>
                    </a>
                  )}
                  {savedTitles.has(tender.title) ? (
                    <button className="flex items-center gap-1 text-xs border rounded-md px-2 py-1 bg-green-50 text-green-700 border-green-200 cursor-default" onClick={(e) => e.stopPropagation()}>✓ נשמר</button>
                  ) : (
                    <button className="flex items-center gap-1 text-xs border rounded-md px-2 py-1 hover:bg-muted" onClick={(e) => { e.stopPropagation(); saveTender(tender) }}>🔖 שמור</button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {tenders.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">לא נמצאו מכרזים רלוונטיים השבוע</p>
            <p className="mt-1 text-xs text-muted-foreground">המכרזים יתעדכנו אוטומטית בסנכרון השבועי</p>
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
                
                {cleanDesc(selectedTender.description) && (
                  <p className="text-muted-foreground">{cleanDesc(selectedTender.description)}</p>
                )}

                <div className="grid grid-cols-2 gap-4">
                  {isBudgetKnown(selectedTender.budget) && (
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground">תקציב משוער</p>
                      <p className="font-semibold text-lg">{selectedTender.budget}</p>
                    </div>
                  )}
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">ציון רלוונטיות</p>
                    <p className={`font-semibold text-lg ${getMatchBand(selectedTender.relevance_score).text}`}>{selectedTender.relevance_score}%</p>
                    <p className={`text-xs ${getMatchBand(selectedTender.relevance_score).text}`}>{getMatchBand(selectedTender.relevance_score).label}</p>
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
                  {selectedTender.link && (
                    <a href={selectedTender.link} target="_blank" rel="noopener noreferrer" className="flex-1">
                      <Button className="w-full">
                        <ExternalLink className="ml-2 h-4 w-4" />
                        הגש הצעה
                      </Button>
                    </a>
                  )}
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
