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
  Pencil,
  RefreshCw,
  UserPlus,
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
  source: string | null
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

type ModalTab = 'details' | 'ai'

export default function CompetitorsPage() {
  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [loading, setLoading] = useState(true)
  const [discovering, setDiscovering] = useState(false)
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

  const supabase = createClient()
  const { toast } = useToast()

  useEffect(() => {
    fetchCompetitors()
  }, [])

  async function fetchCompetitors() {
    const { data, error } = await supabase
      .from("competitors")
      .select("*")
      .order("source", { ascending: true })   // manual first
      .order("threat_score", { ascending: false })

    if (!error && data) setCompetitors(data)
    setLoading(false)
  }

  async function discoverCompetitors() {
    setDiscovering(true)
    try {
      const response = await fetch("/api/find-competitors", { method: "POST" })
      const data = await response.json()
      if (data.success) {
        await fetchCompetitors()
        toast({ title: "גילוי הושלם!", description: `נמצאו ${data.count || 0} מתחרים חדשים` })
      } else {
        toast({ title: "שגיאה", description: data.error || "לא הצלחנו לגלות מתחרים", variant: "destructive" })
      }
    } catch {
      toast({ title: "שגיאה", description: "אירעה שגיאה בעת הגילוי", variant: "destructive" })
    } finally {
      setDiscovering(false)
    }
  }

  function openModal(competitor: Competitor, tab: ModalTab = 'details') {
    setSelectedCompetitor(competitor)
    setActiveTab(tab)
    setShowModal(true)
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
    const { error } = await supabase.from("competitors").delete().eq("id", id)
    if (!error) {
      setCompetitors(competitors.filter(c => c.id !== id))
      setSelectedCompetitor(null)
      setShowModal(false)
      toast({ title: "המתחרה נמחק" })
    }
  }

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "up": return <TrendingUp className="h-4 w-4 text-red-600" />
      case "down": return <TrendingDown className="h-4 w-4 text-green-600" />
      default: return <Minus className="h-4 w-4 text-yellow-600" />
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

  const isManual = (c: Competitor) => c.source === 'manual'
  const manualCompetitors = competitors.filter(isManual)
  const autoCompetitors = competitors.filter(c => !isManual(c))

  const CompetitorTable = ({
    items,
    showEditAction,
  }: {
    items: Competitor[]
    showEditAction: boolean
  }) => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-right">שם</TableHead>
            <TableHead className="text-right hidden md:table-cell">שירותים</TableHead>
            <TableHead className="text-right">ציון איום</TableHead>
            <TableHead className="text-right">מגמה</TableHead>
            <TableHead className="text-right">פעולות</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((competitor) => (
            <TableRow key={competitor.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openModal(competitor, 'details')}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary/60 hover:text-primary"
                    title="פרטים"
                  >
                    <Eye className="h-3 w-3" />
                  </button>
                  <span className="font-medium">{competitor.name}</span>
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <span className="text-sm text-muted-foreground">{competitor.services || "לא ידוע"}</span>
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
                    {showEditAction && (
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">מתחרים</h1>
          <p className="text-muted-foreground">{competitors.length} מתחרים במעקב</p>
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
              <><Loader2 className="ml-2 h-4 w-4 animate-spin" />מגלה מתחרים...</>
            ) : (
              <><Sparkles className="ml-2 h-4 w-4" />גלה מתחרים עם AI</>
            )}
          </Button>
        </div>
      </div>

      {/* Section 1: Manual competitors */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserPlus className="h-5 w-5 text-primary" />
              מתחרים שהוספת
              {manualCompetitors.length > 0 && (
                <Badge variant="secondary">{manualCompetitors.length}</Badge>
              )}
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => setShowAddDialog(true)}>
              <UserPlus className="ml-2 h-3.5 w-3.5" />
              הוסף ידנית
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {manualCompetitors.length > 0 ? (
            <CompetitorTable items={manualCompetitors} showEditAction={true} />
          ) : (
            <div className="px-6 py-8 text-center text-sm text-muted-foreground">
              עדיין לא הוספת מתחרים ידנית. מתחרים שתוסיף ידנית לא יימחקו בסריקות אוטומטיות.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 2: Auto-discovered competitors */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-primary" />
              מתחרים שנמצאו אוטומטית
              {autoCompetitors.length > 0 && (
                <Badge variant="secondary">{autoCompetitors.length}</Badge>
              )}
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={discoverCompetitors}
              disabled={discovering}
            >
              {discovering ? (
                <Loader2 className="ml-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="ml-2 h-3.5 w-3.5" />
              )}
              רענן
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {autoCompetitors.length > 0 ? (
            <CompetitorTable items={autoCompetitors} showEditAction={false} />
          ) : (
            <div className="px-6 py-8 text-center text-sm text-muted-foreground">
              לא נמצאו מתחרים אוטומטית. לחץ "רענן" כדי לסרוק.
            </div>
          )}
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
                      <Badge variant="secondary" className="text-xs">{competitor.services || "לא ידוע"}</Badge>
                      {isManual(competitor) && (
                        <Badge variant="outline" className="text-xs border-primary/40 text-primary">ידני</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{competitor.last_activity || "לחץ לניתוח עם AI"}</p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTimeAgo(competitor.created_at)}
                      </span>
                      <Badge variant="outline" className={competitor.threat_score >= 80 ? "border-red-200 text-red-600" : "border-yellow-200 text-yellow-600"}>
                        איום: {competitor.threat_score}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {analyzing === competitor.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : (
                      <>{getTrendIcon(competitor.trend)}<Brain className="h-4 w-4 text-muted-foreground" /></>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
