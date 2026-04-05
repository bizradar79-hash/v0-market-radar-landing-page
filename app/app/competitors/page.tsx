"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  AlertTriangle,
  Loader2,
  MoreHorizontal,
  Eye,
  Trash2,
  ExternalLink,
  Brain,
  CheckCircle2,
  XCircle,
  Lightbulb,
  ShieldAlert,
  Pencil,
  UserPlus,
  Bot,
  Star,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface Competitor {
  id: string
  company_id: string
  name: string
  website: string
  phone?: string | null
  services: string
  pricing: string
  positioning: string
  last_activity: string
  threat_score: number
  trend: string
  source: string | null
  google_rating: number | null
  google_review_count: number | null
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

interface RankingResult {
  position: number
  name: string
  url?: string
  title?: string
  isOwn?: boolean
  isKnownCompetitor?: boolean
}

interface ReviewsAnalysis {
  google_rating: number | null
  google_review_count: number | null
  google_maps_url: string | null
}

type ModalTab = 'details' | 'ai' | 'reviews'

export default function CompetitorsPage() {
  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [loading, setLoading] = useState(true)
  const [syncDates, setSyncDates] = useState<{ last_sync_at: string | null; next_sync_at: string | null } | null>(null)
  const [selectedCompetitor, setSelectedCompetitor] = useState<Competitor | null>(null)
  const [analyzing, setAnalyzing] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<CompetitorAnalysis | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [activeTab, setActiveTab] = useState<ModalTab>('details')

  // Add manual competitor dialog
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [addName, setAddName] = useState("")
  const [addWebsite, setAddWebsite] = useState("")
  const [addServices, setAddServices] = useState("")
  const [addThreatScore, setAddThreatScore] = useState("")
  const [adding, setAdding] = useState(false)

  // Edit dialog state (manual competitors only)
  const [editingCompetitor, setEditingCompetitor] = useState<Competitor | null>(null)
  const [editName, setEditName] = useState("")
  const [editWebsite, setEditWebsite] = useState("")
  const [editServices, setEditServices] = useState("")
  const [editThreatScore, setEditThreatScore] = useState("")
  const [saving, setSaving] = useState(false)

  const [fetchingRating, setFetchingRating] = useState<Record<string, boolean>>({})

  // Reviews analysis
  const [reviews, setReviews] = useState<Record<string, ReviewsAnalysis>>({})
  const [loadingReviews, setLoadingReviews] = useState<Record<string, boolean>>({})

  const supabase = createClient()
  const { toast } = useToast()

  useEffect(() => {
    fetchSyncDates()
    syncProfileCompetitors().then(() => fetchCompetitors())
  }, [])

  async function fetchSyncDates() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('companies').select('last_sync_at, next_sync_at').eq('id', user.id).single()
    if (data) setSyncDates({ last_sync_at: (data as any).last_sync_at ?? null, next_sync_at: (data as any).next_sync_at ?? null })
  }

  async function syncProfileCompetitors() {
    try {
      await fetch('/api/sync-profile-competitors', { method: 'POST' })
    } catch {
      // non-blocking — don't stop page load on failure
    }
  }

  async function fetchCompetitors() {
    const { data, error } = await supabase
      .from("competitors")
      .select("*")

    if (!error && data) {
      // Sort by threat_score desc; manual competitors appear first within same score group
      const sorted = [...data].sort((a, b) => {
        const scoreDiff = (b.threat_score || 0) - (a.threat_score || 0)
        if (scoreDiff !== 0) return scoreDiff
        const aManual = a.source === 'manual' ? 0 : 1
        const bManual = b.source === 'manual' ? 0 : 1
        return aManual - bManual
      })
      // Trim to max 10 — delete excess auto competitors from DB
      if (sorted.length > 10) {
        const excess = sorted.slice(10).filter(c => c.source !== 'manual')
        if (excess.length > 0) {
          await supabase.from('competitors').delete().in('id', excess.map(c => c.id))
        }
        setCompetitors(sorted.slice(0, 10))
      } else {
        setCompetitors(sorted)
      }
      // Auto-fetch ratings for ALL competitors with missing google_rating (background, fire-and-forget)
      const needsRating = sorted.filter(c => c.google_rating == null && c.website)
      needsRating.forEach(c => fetchGoogleRating(c))
      // Auto-fetch services description for competitors with empty/null services
      const needsServices = sorted.filter(c => !c.services || c.services === 'לא ידוע')
      needsServices.forEach(c => fetchMissingServices(c))
    }
    setLoading(false)
  }

  function openModal(competitor: Competitor, tab: ModalTab = 'details') {
    setSelectedCompetitor(competitor)
    setActiveTab(tab)
    setShowModal(true)
  }

  function handleEyeClick(competitor: Competitor) {
    openModal(competitor, 'details')
    // Trigger fetch if not already loaded or loading
    const needsFetch = competitor.google_rating == null && competitor.google_review_count == null
    if (needsFetch && !fetchingRating[competitor.id]) {
      fetchGoogleRating(competitor)
    }
  }

  async function fetchGoogleRating(competitor: Competitor) {
    setFetchingRating(prev => ({ ...prev, [competitor.id]: true }))
    try {
      const res = await fetch('/api/fetch-competitor-rating', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          competitorId: competitor.id,
          name: competitor.name,
          website: competitor.website || '',
          phone: competitor.phone || undefined,
        }),
      })
      if (!res.ok) {
        console.error('fetch-competitor-rating failed:', res.status, await res.text())
        return
      }
      const result = await res.json()
      if (result.success) {
        const rating = result.rating ?? null
        const reviewCount = result.reviewCount ?? null
        const newScore = result.threat_score ?? null
        const update = (c: Competitor) => ({
          ...c,
          google_rating: rating,
          google_review_count: reviewCount,
          ...(newScore !== null ? { threat_score: newScore } : {}),
        })
        setCompetitors(prev => prev.map(c => c.id === competitor.id ? update(c) : c))
        setSelectedCompetitor(prev => prev?.id === competitor.id ? update(prev) : prev)
      } else {
        console.error('fetch-competitor-rating error:', result.error)
      }
    } catch (e) {
      console.error('fetchGoogleRating exception:', e)
    } finally {
      setFetchingRating(prev => ({ ...prev, [competitor.id]: false }))
    }
  }

  async function fetchMissingServices(competitor: Competitor) {
    try {
      const res = await fetch('/api/lookup-competitor-services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: competitor.name }),
      })
      if (!res.ok) return
      const { services } = await res.json()
      if (!services) return
      // Update in DB
      await supabase.from('competitors').update({ services }).eq('id', competitor.id)
      setCompetitors(prev => prev.map(c => c.id === competitor.id ? { ...c, services } : c))
      setSelectedCompetitor(prev => prev?.id === competitor.id ? { ...prev, services } : prev)
    } catch { /* silent */ }
  }

  async function fetchReviews(competitor: Competitor) {
    if (reviews[competitor.id] || loadingReviews[competitor.id]) return
    // Check sessionStorage cache
    const cacheKey = `reviews_${competitor.id}`
    const cached = sessionStorage.getItem(cacheKey)
    if (cached) {
      try { setReviews(prev => ({ ...prev, [competitor.id]: JSON.parse(cached) })); return } catch {}
    }
    setLoadingReviews(prev => ({ ...prev, [competitor.id]: true }))
    try {
      const res = await fetch('/api/analyze-competitor-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competitorName: competitor.name, competitorWebsite: competitor.website }),
      })
      const data = await res.json()
      if (data.success) {
        setReviews(prev => ({ ...prev, [competitor.id]: data }))
        sessionStorage.setItem(cacheKey, JSON.stringify(data))
      }
    } catch (e) {
      console.error('fetchReviews error:', e)
    } finally {
      setLoadingReviews(prev => ({ ...prev, [competitor.id]: false }))
    }
  }

  async function addManualCompetitor() {
    if (!addName.trim()) return
    setAdding(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      toast({ title: "שגיאת אימות", description: "יש להתחבר מחדש", variant: "destructive" })
      setAdding(false)
      return
    }
    const scoreVal = parseInt(addThreatScore)
    const { data, error } = await supabase.from("competitors").insert({
      name: addName.trim(),
      website: addWebsite.trim(),
      services: addServices.trim(),
      pricing: '',
      threat_score: !isNaN(scoreVal) ? Math.min(100, Math.max(0, scoreVal)) : null,
      trend: 'stable',
      source: 'manual',
      company_id: user.id,
    }).select().single()
    if (!error && data) {
      setCompetitors(prev => [data, ...prev])
      setShowAddDialog(false)
      setAddName(""); setAddWebsite(""); setAddServices(""); setAddThreatScore("")
      toast({ title: "המתחרה נוסף" })
      // Fetch Google rating in the background for the newly added manual competitor
      if (data.website) {
        fetchGoogleRating(data)
      }
    } else {
      toast({ title: "שגיאה בהוספה", description: error?.message, variant: "destructive" })
    }
    setAdding(false)
  }

  function openEdit(competitor: Competitor) {
    setEditingCompetitor(competitor)
    setEditName(competitor.name)
    setEditWebsite(competitor.website)
    setEditServices(competitor.services)
    setEditThreatScore(competitor.threat_score != null ? String(competitor.threat_score) : '')
  }

  async function saveEdit() {
    if (!editingCompetitor) return
    setSaving(true)
    const scoreVal = parseInt(editThreatScore)
    const updates: any = { name: editName.trim(), website: editWebsite.trim(), services: editServices.trim() }
    if (editThreatScore.trim() !== '') updates.threat_score = Math.min(100, Math.max(0, scoreVal || 0))
    const { error } = await supabase.from("competitors").update(updates).eq("id", editingCompetitor.id)
    if (!error) {
      setCompetitors(prev => prev.map(c =>
        c.id === editingCompetitor.id ? { ...c, ...updates } : c
      ))
      setEditingCompetitor(null)
      toast({ title: "עודכן בהצלחה" })
    } else {
      toast({ title: "שגיאה בשמירה", variant: "destructive" })
    }
    setSaving(false)
  }

  async function analyzeCompetitor(competitor: Competitor) {
    setAnalyzing(competitor.id)
    setAnalysis(null)
    openModal(competitor, 'ai')

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
        await fetchCompetitors()
        toast({ title: "ניתוח הושלם!", description: `הניתוח של ${competitor.name} מוכן` })
      } else {
        toast({ title: "שגיאה בניתוח", description: data.error || "לא הצלחנו לנתח", variant: "destructive" })
        setShowModal(false)
      }
    } catch {
      toast({ title: "שגיאה", description: "אירעה שגיאה בעת הניתוח", variant: "destructive" })
      setShowModal(false)
    } finally {
      setAnalyzing(null)
    }
  }

  async function deleteCompetitor(id: string) {
    const competitor = competitors.find(c => c.id === id)
    const { error } = await supabase.from("competitors").delete().eq("id", id)
    if (!error) {
      // Add name to blacklist so it won't reappear in auto-scans
      if (competitor) {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: company } = await supabase
            .from('companies').select('competitors_blacklist').eq('id', user.id).single()
          const current: string[] = company?.competitors_blacklist || []
          if (!current.includes(competitor.name)) {
            await supabase.from('companies')
              .update({ competitors_blacklist: [...current, competitor.name] })
              .eq('id', user.id)
          }
        }
      }
      setCompetitors(competitors.filter(c => c.id !== id))
      setSelectedCompetitor(null)
      setShowModal(false)
      toast({ title: "המתחרה נמחק" })
    }
  }

  const getThreatColor = (score: number) => {
    if (score >= 80) return "text-red-600"
    if (score >= 60) return "text-yellow-600"
    return "text-green-600"
  }

  const getPositionBadge = (position: string) => {
    switch (position) {
      case "מוביל שוק": return "bg-red-100 text-red-700 border-red-200"
      case "מתחרה ישיר": return "bg-orange-100 text-orange-700 border-orange-200"
      case "שחקן חדש": return "bg-blue-100 text-blue-700 border-blue-200"
      default: return "bg-gray-100 text-gray-700 border-gray-200"
    }
  }


  const isManual = (c: Competitor) => c.source === 'manual'

  const CompetitorTable = ({ items }: { items: Competitor[] }) => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-right">שם</TableHead>
            <TableHead className="text-right hidden md:table-cell">שירותים</TableHead>
            <TableHead className="text-right hidden lg:table-cell">דירוג גוגל</TableHead>
            <TableHead className="text-right hidden lg:table-cell">ביקורות</TableHead>
            <TableHead className="text-right">ציון איום</TableHead>
            <TableHead className="text-right">פעולות</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((competitor) => (
            <TableRow key={competitor.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleEyeClick(competitor)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary/60 hover:text-primary"
                    title="פרטים ודירוג גוגל"
                  >
                    {fetchingRating[competitor.id]
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Eye className="h-3 w-3" />
                    }
                  </button>
                  <span className="font-medium">{competitor.name}</span>
                  <Badge
                    variant="outline"
                    className={`text-xs px-1.5 py-0 ${isManual(competitor) ? 'border-gray-300 text-gray-500 bg-gray-50' : 'border-teal-300 text-teal-600 bg-teal-50'}`}
                  >
                    {isManual(competitor) ? 'ידני' : 'אוטומטי'}
                  </Badge>
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <span className="text-sm text-muted-foreground">{competitor.services || "לא ידוע"}</span>
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                {fetchingRating[competitor.id] ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                ) : competitor.google_rating != null ? (
                  <span className="text-sm font-medium">⭐ {competitor.google_rating.toFixed(1)}</span>
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                {competitor.google_review_count != null ? (
                  <span className="text-sm text-muted-foreground">{competitor.google_review_count.toLocaleString()}</span>
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => analyzeCompetitor(competitor)}>
                      <Brain className="ml-2 h-4 w-4" />
                      ניתוח AI
                    </DropdownMenuItem>
                    {isManual(competitor) && (
                      <DropdownMenuItem onClick={() => openEdit(competitor)}>
                        <Pencil className="ml-2 h-4 w-4" />
                        ערוך
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => openModal(competitor, 'details')}>
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
                    <DropdownMenuItem onClick={() => deleteCompetitor(competitor.id)} className="text-red-600">
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
  )

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
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">מתחרים</h1>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>{competitors.length} מתחרים במעקב</span>
          {competitors.filter(c => c.threat_score >= 80).length > 0 && (
            <span className="flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
              {competitors.filter(c => c.threat_score >= 80).length} ברמת איום גבוהה
            </span>
          )}
        </div>
        {syncDates && (
          <p className="text-xs text-muted-foreground">
            עודכן: {syncDates.last_sync_at ? new Date(syncDates.last_sync_at).toLocaleDateString('he-IL') : '—'} | עדכון הבא: {syncDates.next_sync_at ? new Date(syncDates.next_sync_at).toLocaleDateString('he-IL') : '—'}
          </p>
        )}
      </div>

      {/* Unified competitors list */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="h-5 w-5 text-primary" />
              כל המתחרים
              {competitors.length > 0 && (
                <Badge variant="secondary">{competitors.length}</Badge>
              )}
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => setShowAddDialog(true)} disabled={competitors.length >= 10}>
              <UserPlus className="ml-2 h-3.5 w-3.5" />
              הוסף ידנית
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {competitors.length >= 10 && (
            <div className="px-4 py-2.5 mx-4 mt-3 mb-1 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-700 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              הגעת למקסימום 10 מתחרים. מחק מתחרה כדי להוסיף חדש.
            </div>
          )}
          {competitors.length > 0 ? (
            <CompetitorTable items={competitors} />
          ) : (
            <div className="px-6 py-8 text-center text-sm text-muted-foreground">
              לא נמצאו מתחרים עדיין. הגילוי האוטומטי יתבצע בסנכרון הבא, או הוסף ידנית.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Manual Competitor Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(open) => { if (!open) { setShowAddDialog(false); setAddName(""); setAddWebsite(""); setAddServices("") } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>הוסף מתחרה ידנית</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>שם המתחרה *</Label>
              <Input value={addName} onChange={e => setAddName(e.target.value)} placeholder="שם החברה" />
            </div>
            <div className="space-y-1.5">
              <Label>אתר אינטרנט</Label>
              <Input dir="ltr" value={addWebsite} onChange={e => setAddWebsite(e.target.value)} placeholder="https://" className="text-left" />
            </div>
            <div className="space-y-1.5">
              <Label>שירותים</Label>
              <Input value={addServices} onChange={e => setAddServices(e.target.value)} placeholder="תאר את השירותים..." />
            </div>
            <div className="space-y-1.5">
              <Label>ציון איום (0-100)</Label>
              <Input type="number" min="0" max="100" value={addThreatScore} onChange={e => setAddThreatScore(e.target.value)} placeholder="ריק = לא מוגדר" />
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={addManualCompetitor} disabled={adding || !addName.trim()}>
                {adding && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                הוסף
              </Button>
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>ביטול</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog (manual competitors only) */}
      <Dialog open={!!editingCompetitor} onOpenChange={(open) => { if (!open) setEditingCompetitor(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>ערוך מתחרה</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>שם</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>אתר</Label>
              <Input dir="ltr" value={editWebsite} onChange={e => setEditWebsite(e.target.value)} placeholder="https://" className="text-left" />
            </div>
            <div className="space-y-1.5">
              <Label>שירותים</Label>
              <Input value={editServices} onChange={e => setEditServices(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>ציון איום (0-100)</Label>
              <Input type="number" min="0" max="100" value={editThreatScore} onChange={e => setEditThreatScore(e.target.value)} placeholder="ריק = לא מוגדר" />
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={saveEdit} disabled={saving || !editName.trim()}>
                {saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                שמור
              </Button>
              <Button variant="outline" onClick={() => setEditingCompetitor(null)}>ביטול</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Competitor Detail / AI Modal */}
      <Dialog open={showModal} onOpenChange={(open) => {
        if (!open) { setShowModal(false); setSelectedCompetitor(null); setAnalysis(null) }
      }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedCompetitor && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Target className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <span>{selectedCompetitor.name}</span>
                    {analysis && (
                      <Badge className="mr-2" variant={analysis.threatLevel === "גבוה" ? "destructive" : analysis.threatLevel === "בינוני" ? "secondary" : "outline"}>
                        רמת איום: {analysis.threatLevel}
                      </Badge>
                    )}
                  </div>
                </DialogTitle>

                <div className="flex gap-0 border-b mt-2">
                  {([
                    { id: 'details' as ModalTab, label: 'פרטים', icon: Eye },
                    { id: 'ai' as ModalTab, label: 'ניתוח AI', icon: Brain },
                    { id: 'reviews' as ModalTab, label: 'ניתוח ביקורות 🌟', icon: Star },
                  ]).map(tab => {
                    const Icon = tab.icon
                    return (
                      <button
                        key={tab.id}
                        onClick={() => {
                          setActiveTab(tab.id)
                          if (tab.id === 'ai' && !analysis && analyzing !== selectedCompetitor.id) {
                            analyzeCompetitor(selectedCompetitor)
                          }
                          if (tab.id === 'reviews') {
                            fetchReviews(selectedCompetitor)
                          }
                        }}
                        className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                          activeTab === tab.id
                            ? 'border-primary text-primary'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {tab.label}
                      </button>
                    )
                  })}
                </div>
              </DialogHeader>

              <div className="mt-4">
                {activeTab === 'details' && (
                  <div className="space-y-4">
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
                      <div>
                        <p className="text-sm text-muted-foreground">מקור</p>
                        <Badge variant="outline" className={isManual(selectedCompetitor) ? "border-primary/40 text-primary" : "border-muted-foreground/40"}>
                          {isManual(selectedCompetitor) ? "הוסף ידנית" : "נמצא אוטומטית"}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">דירוג גוגל</p>
                        {fetchingRating[selectedCompetitor.id] ? (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">מחפש...</span>
                          </div>
                        ) : selectedCompetitor.google_rating != null ? (
                          <p className="font-medium">
                            ⭐ {selectedCompetitor.google_rating.toFixed(1)}
                            {selectedCompetitor.google_review_count != null && (
                              <span className="text-sm text-muted-foreground font-normal mr-1.5">
                                ({selectedCompetitor.google_review_count.toLocaleString()} ביקורות)
                              </span>
                            )}
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground">לא נמצא</p>
                        )}
                      </div>
                    </div>
                    {selectedCompetitor.last_activity && (
                      <div className="col-span-2">
                        <p className="text-sm text-muted-foreground">
                          {isManual(selectedCompetitor) ? 'פעילות אחרונה' : 'ניתוח ציון איום'}
                        </p>
                        <p className="text-sm mt-1 rounded-lg bg-muted/40 border px-3 py-2">
                          {selectedCompetitor.last_activity}
                        </p>
                      </div>
                    )}
                    <div className="flex gap-2 pt-4 border-t">
                      <Button onClick={() => { setActiveTab('ai'); analyzeCompetitor(selectedCompetitor) }}>
                        <Brain className="ml-2 h-4 w-4" />נתח עם AI
                      </Button>
                      {isManual(selectedCompetitor) && (
                        <Button variant="outline" onClick={() => { setShowModal(false); openEdit(selectedCompetitor) }}>
                          <Pencil className="ml-2 h-4 w-4" />ערוך
                        </Button>
                      )}
                      {selectedCompetitor.website && (
                        <Button variant="outline" asChild>
                          <a href={selectedCompetitor.website.startsWith('http') ? selectedCompetitor.website : `https://${selectedCompetitor.website}`} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="ml-2 h-4 w-4" />פתח אתר
                          </a>
                        </Button>
                      )}
                      <Button variant="outline" className="text-red-600" onClick={() => deleteCompetitor(selectedCompetitor.id)}>
                        <Trash2 className="ml-2 h-4 w-4" />מחק
                      </Button>
                    </div>
                  </div>
                )}

                {activeTab === 'reviews' && (
                  <div>
                    {loadingReviews[selectedCompetitor.id] ? (
                      <div className="flex flex-col items-center justify-center py-12 space-y-3">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-sm text-muted-foreground">מחפש נתוני גוגל מאפס...</p>
                      </div>
                    ) : reviews[selectedCompetitor.id] ? (
                      <div className="space-y-4">
                        {reviews[selectedCompetitor.id].google_rating != null ? (
                          <div className="flex items-center gap-1.5 rounded-full bg-yellow-50 border border-yellow-200 px-3 py-1 w-fit">
                            <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                            <span className="text-sm font-semibold">{reviews[selectedCompetitor.id].google_rating!.toFixed(1)}</span>
                            {reviews[selectedCompetitor.id].google_review_count != null && (
                              <span className="text-xs text-muted-foreground">({reviews[selectedCompetitor.id].google_review_count!.toLocaleString()} ביקורות)</span>
                            )}
                            <span className="text-xs text-muted-foreground">גוגל מאפס</span>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">לא נמצא דף Google Maps</p>
                        )}
                        <a
                          href={reviews[selectedCompetitor.id].google_maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedCompetitor.name + (selectedCompetitor.website ? ' ' + selectedCompetitor.website : ''))}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm font-medium text-primary hover:bg-primary/10 transition-colors w-fit"
                        >
                          <ExternalLink className="ml-2 h-4 w-4" />
                          {reviews[selectedCompetitor.id].google_maps_url ? 'צפה בביקורות בגוגל מאפס' : 'חפש בגוגל מאפס'}
                        </a>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 space-y-4">
                        <Star className="h-12 w-12 text-muted-foreground/50" />
                        <p className="text-muted-foreground">לחץ לחיפוש דירוג גוגל מאפס של {selectedCompetitor.name}</p>
                        <Button onClick={() => fetchReviews(selectedCompetitor)}>
                          <Star className="ml-2 h-4 w-4" />חפש בגוגל מאפס
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'ai' && (
                  <div>
                    {analyzing === selectedCompetitor.id ? (
                      <div className="flex flex-col items-center justify-center py-12 space-y-4">
                        <Loader2 className="h-12 w-12 animate-spin text-primary" />
                        <p className="text-muted-foreground">מנתח את {selectedCompetitor.name}...</p>
                      </div>
                    ) : analysis ? (
                      <div className="space-y-6">
                        <div className="rounded-lg bg-muted/50 p-4">
                          <h4 className="font-semibold mb-2 flex items-center gap-2">
                            <Eye className="h-4 w-4 text-primary" />סקירה כללית
                          </h4>
                          <p className="text-sm text-muted-foreground">{analysis.overview}</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="rounded-lg border p-4">
                            <h4 className="font-semibold mb-2">מוצרים ושירותים</h4>
                            <ul className="space-y-1">
                              {analysis.products.map((product, i) => (
                                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                  <span className="text-primary mt-1">•</span>{product}
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
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="rounded-lg border border-green-200 bg-green-50/50 p-4">
                            <h4 className="font-semibold mb-2 flex items-center gap-2 text-green-700">
                              <CheckCircle2 className="h-4 w-4" />חוזקות
                            </h4>
                            <ul className="space-y-1">
                              {analysis.strengths.map((s, i) => (
                                <li key={i} className="text-sm text-green-700 flex items-start gap-2">
                                  <span className="mt-1">•</span>{s}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div className="rounded-lg border border-red-200 bg-red-50/50 p-4">
                            <h4 className="font-semibold mb-2 flex items-center gap-2 text-red-700">
                              <XCircle className="h-4 w-4" />חולשות
                            </h4>
                            <ul className="space-y-1">
                              {analysis.weaknesses.map((w, i) => (
                                <li key={i} className="text-sm text-red-700 flex items-start gap-2">
                                  <span className="mt-1">•</span>{w}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                        <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
                          <h4 className="font-semibold mb-2 flex items-center gap-2 text-blue-700">
                            <Lightbulb className="h-4 w-4" />הזדמנויות מולם
                          </h4>
                          <ul className="space-y-1">
                            {analysis.opportunities.map((o, i) => (
                              <li key={i} className="text-sm text-blue-700 flex items-start gap-2">
                                <span className="mt-1">•</span>{o}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                          <h4 className="font-semibold mb-2 flex items-center gap-2 text-primary">
                            <ShieldAlert className="h-4 w-4" />המלצות אסטרטגיות
                          </h4>
                          <ul className="space-y-2">
                            {analysis.recommendations.map((rec, i) => (
                              <li key={i} className="text-sm flex items-start gap-2">
                                <span className="font-bold text-primary">{i + 1}.</span>{rec}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="flex gap-2 pt-4 border-t">
                          {selectedCompetitor.website && (
                            <Button variant="outline" asChild>
                              <a href={selectedCompetitor.website.startsWith('http') ? selectedCompetitor.website : `https://${selectedCompetitor.website}`} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="ml-2 h-4 w-4" />פתח אתר
                              </a>
                            </Button>
                          )}
                          <Button variant="outline" onClick={() => analyzeCompetitor(selectedCompetitor)}>
                            <Brain className="ml-2 h-4 w-4" />נתח מחדש
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 space-y-4">
                        <Brain className="h-12 w-12 text-muted-foreground/50" />
                        <p className="text-muted-foreground">לחץ לניתוח AI</p>
                        <Button onClick={() => analyzeCompetitor(selectedCompetitor)}>
                          <Brain className="ml-2 h-4 w-4" />נתח עם AI
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
