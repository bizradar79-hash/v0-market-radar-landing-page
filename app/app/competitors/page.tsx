"use client"

export const dynamic = 'force-dynamic'

import React, { useState, useEffect } from "react"
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
  BarChart2,
  Globe,
  Smartphone,
  Monitor,
  ChevronDown,
  ChevronUp,
  MapPin,
  Phone,
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

interface TrafficData {
  monthly_visits: string | null
  organic_pct: number | null
  paid_pct: number | null
  direct_pct: number | null
  top_countries: string[] | null
  mobile_pct: number | null
  desktop_pct: number | null
  bounce_rate: string | null
  avg_duration: string | null
  global_rank: string | null
  data_quality: string | null
}

interface PanelData {
  contact: { address: string; phone: string; website: string }
  aiSummary: string
  monthlyVisits: string | null
}

type ModalTab = 'details' | 'ai' | 'traffic'

function PanelContent({ panel, fallbackWebsite }: { panel: PanelData; fallbackWebsite: string }) {
  const websiteHref = panel.contact.website || fallbackWebsite
  const websiteUrl = websiteHref?.startsWith('http') ? websiteHref : websiteHref ? `https://${websiteHref}` : ''
  const hasContact = panel.contact.address || panel.contact.phone || panel.contact.website

  return (
    <div className="space-y-0 divide-y divide-border">
      {/* Row 1: פרטי החברה — website | phone | address horizontal */}
      <div className="px-6 py-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">פרטי החברה</p>
        {hasContact ? (
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
            {panel.contact.website && (
              <a
                href={websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-primary hover:underline"
                dir="ltr"
              >
                <Globe className="h-4 w-4 shrink-0" />
                {panel.contact.website.replace(/^https?:\/\//, '')}
              </a>
            )}
            {panel.contact.phone && (
              <div className="flex items-center gap-2 text-sm" dir="ltr">
                <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{panel.contact.phone}</span>
              </div>
            )}
            {panel.contact.address && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{panel.contact.address}</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">לא נמצאו פרטי קשר</p>
        )}
      </div>

      {/* Row 2: ניתוח AI — full width, light background */}
      <div className="bg-muted/30 px-6 py-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">ניתוח AI</p>
        {panel.aiSummary
          ? <p className="text-sm leading-relaxed">{panel.aiSummary}</p>
          : <p className="text-sm text-muted-foreground">לא זמין</p>
        }
      </div>

      {/* Row 3: ניתוח תנועה — badge */}
      <div className="px-6 py-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">ניתוח תנועה</p>
        {panel.monthlyVisits
          ? (
            <Badge variant="secondary" className="text-sm font-medium">
              ~{panel.monthlyVisits} ביקורים חודשיים
            </Badge>
          )
          : <span className="text-sm text-muted-foreground">נתון לא זמין</span>
        }
      </div>

      {/* Row 4: בקר באתר — aligned right */}
      {websiteUrl && (
        <div className="flex justify-end px-6 py-3">
          <a
            href={websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            בקר באתר
          </a>
        </div>
      )}
    </div>
  )
}

export default function CompetitorsPage() {
  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [loading, setLoading] = useState(true)
  const [discovering, setDiscovering] = useState(false)
  const [selectedCompetitor, setSelectedCompetitor] = useState<Competitor | null>(null)
  const [analyzing, setAnalyzing] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<CompetitorAnalysis | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [activeTab, setActiveTab] = useState<ModalTab>('details')
  const [trafficData, setTrafficData] = useState<TrafficData | null>(null)
  const [loadingTraffic, setLoadingTraffic] = useState(false)
  // Inline expand panel
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loadingPanel, setLoadingPanel] = useState<string | null>(null)
  const [panelCache, setPanelCache] = useState<Record<string, PanelData>>({})
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

  async function fetchTrafficData(competitor: Competitor) {
    setLoadingTraffic(true)
    setTrafficData(null)
    openModal(competitor, 'traffic')

    try {
      const res = await fetch('/api/analyze-competitor-traffic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          competitorName: competitor.name,
          competitorWebsite: competitor.website,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setTrafficData(data.traffic)
      } else {
        toast({ title: 'שגיאה', description: data.error || 'לא ניתן לטעון נתוני תנועה', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'שגיאה', description: 'לא ניתן לטעון נתוני תנועה', variant: 'destructive' })
    } finally {
      setLoadingTraffic(false)
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

  async function togglePanel(competitor: Competitor) {
    // Collapse if already open
    if (expandedId === competitor.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(competitor.id)
    // Return cached data if already fetched
    if (panelCache[competitor.id]) return
    // Fetch panel data
    setLoadingPanel(competitor.id)
    try {
      const res = await fetch('/api/competitor-panel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competitorName: competitor.name, competitorWebsite: competitor.website }),
      })
      const data = await res.json()
      if (!data.error) {
        setPanelCache(prev => ({ ...prev, [competitor.id]: data as PanelData }))
      }
    } catch {
      // silent — panel shows empty state
    } finally {
      setLoadingPanel(null)
    }
  }

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "up": return <TrendingUp className="h-4 w-4 text-red-600" />
      case "down": return <TrendingDown className="h-4 w-4 text-green-600" />
      default: return <Minus className="h-4 w-4 text-yellow-600" />
    }
  }

  const getTrendText = (trend: string) => {
    switch (trend) {
      case "up": return "עולה"
      case "down": return "יורד"
      default: return "יציב"
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
                  <React.Fragment key={competitor.id}>
                  <TableRow>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => togglePanel(competitor)}
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors ${
                            expandedId === competitor.id
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border text-muted-foreground hover:border-primary/60 hover:text-primary'
                          }`}
                          title="פרטים"
                        >
                          {loadingPanel === competitor.id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : expandedId === competitor.id
                              ? <ChevronUp className="h-3 w-3" />
                              : <ChevronDown className="h-3 w-3" />
                          }
                        </button>
                        <span className="font-medium">{competitor.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-sm text-muted-foreground">{competitor.services || "לא ידוע"}</span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-sm text-muted-foreground">{competitor.pricing || "לא ידוע"}</span>
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
                        <span className="text-xs text-muted-foreground">{getTrendText(competitor.trend)}</span>
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
                          <DropdownMenuItem onClick={() => fetchTrafficData(competitor)}>
                            <BarChart2 className="ml-2 h-4 w-4" />
                            ניתוח תנועה
                          </DropdownMenuItem>
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

                  {/* Expandable detail panel */}
                  {expandedId === competitor.id && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={7} className="p-0 border-b">
                        <div className="border-t bg-background rounded-b-md overflow-hidden">
                          {loadingPanel === competitor.id ? (
                            <div className="flex items-center gap-3 px-6 py-5 text-muted-foreground text-sm">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              טוען פרטי מתחרה...
                            </div>
                          ) : panelCache[competitor.id] ? (
                            <PanelContent panel={panelCache[competitor.id]} fallbackWebsite={competitor.website} />
                          ) : (
                            <p className="px-6 py-4 text-sm text-muted-foreground">לא ניתן לטעון פרטים</p>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  </React.Fragment>
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
                      <Badge variant="secondary" className="text-xs">{competitor.services || "לא ידוע"}</Badge>
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

      {competitors.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Target className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">לא נמצאו מתחרים במעקב</p>
            <Button className="mt-4" onClick={discoverCompetitors} disabled={discovering}>
              <Sparkles className="ml-2 h-4 w-4" />גלה מתחרים עם AI
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Competitor Modal with Tabs */}
      <Dialog open={showModal} onOpenChange={(open) => {
        if (!open) { setShowModal(false); setSelectedCompetitor(null); setAnalysis(null); setTrafficData(null) }
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

                {/* Tabs */}
                <div className="flex gap-0 border-b mt-2">
                  {([
                    { id: 'details' as ModalTab, label: 'פרטים', icon: Eye },
                    { id: 'ai' as ModalTab, label: 'ניתוח AI', icon: Brain },
                    { id: 'traffic' as ModalTab, label: 'ניתוח תנועה', icon: BarChart2 },
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
                          if (tab.id === 'traffic' && !trafficData && !loadingTraffic) {
                            fetchTrafficData(selectedCompetitor)
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
                {/* Details Tab */}
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
                    </div>
                    {selectedCompetitor.last_activity && (
                      <div>
                        <p className="text-sm text-muted-foreground">פעילות אחרונה</p>
                        <p>{selectedCompetitor.last_activity}</p>
                      </div>
                    )}
                    <div className="flex gap-2 pt-4 border-t">
                      <Button onClick={() => { setActiveTab('ai'); analyzeCompetitor(selectedCompetitor) }}>
                        <Brain className="ml-2 h-4 w-4" />נתח עם AI
                      </Button>
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

                {/* AI Analysis Tab */}
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

                {/* Traffic Analysis Tab */}
                {activeTab === 'traffic' && (
                  <div>
                    {loadingTraffic ? (
                      <div className="flex flex-col items-center justify-center py-12 space-y-4">
                        <Loader2 className="h-12 w-12 animate-spin text-primary" />
                        <p className="text-muted-foreground">מנתח נתוני תנועה עבור {selectedCompetitor.name}...</p>
                        <p className="text-xs text-muted-foreground">עשוי לקחת כ-20 שניות</p>
                      </div>
                    ) : trafficData ? (
                      <div className="space-y-5">
                        {/* Header metric */}
                        {trafficData.monthly_visits && (
                          <div className="rounded-xl bg-primary/10 p-5 text-center">
                            <p className="text-4xl font-bold text-primary">{trafficData.monthly_visits}</p>
                            <p className="text-sm text-muted-foreground mt-1">ביקורים חודשיים (משוער)</p>
                            {trafficData.global_rank && (
                              <p className="text-xs text-muted-foreground mt-1">דירוג גלובלי: #{trafficData.global_rank}</p>
                            )}
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                          {/* Traffic Sources */}
                          <div className="rounded-lg border p-4 space-y-3">
                            <h4 className="font-semibold text-sm flex items-center gap-2">
                              <Globe className="h-4 w-4 text-primary" />מקורות תנועה
                            </h4>
                            {trafficData.organic_pct !== null && (
                              <div className="space-y-1">
                                <div className="flex justify-between text-xs">
                                  <span>אורגני</span>
                                  <span className="font-medium">{trafficData.organic_pct}%</span>
                                </div>
                                <Progress value={trafficData.organic_pct} className="h-1.5" />
                              </div>
                            )}
                            {trafficData.paid_pct !== null && (
                              <div className="space-y-1">
                                <div className="flex justify-between text-xs">
                                  <span>ממומן</span>
                                  <span className="font-medium">{trafficData.paid_pct}%</span>
                                </div>
                                <Progress value={trafficData.paid_pct} className="h-1.5" />
                              </div>
                            )}
                            {trafficData.direct_pct !== null && (
                              <div className="space-y-1">
                                <div className="flex justify-between text-xs">
                                  <span>ישיר</span>
                                  <span className="font-medium">{trafficData.direct_pct}%</span>
                                </div>
                                <Progress value={trafficData.direct_pct} className="h-1.5" />
                              </div>
                            )}
                          </div>

                          {/* Device Split */}
                          <div className="rounded-lg border p-4 space-y-3">
                            <h4 className="font-semibold text-sm flex items-center gap-2">
                              <Smartphone className="h-4 w-4 text-primary" />מכשירים
                            </h4>
                            {trafficData.mobile_pct !== null && (
                              <div className="space-y-1">
                                <div className="flex justify-between text-xs">
                                  <span className="flex items-center gap-1"><Smartphone className="h-3 w-3" />מובייל</span>
                                  <span className="font-medium">{trafficData.mobile_pct}%</span>
                                </div>
                                <Progress value={trafficData.mobile_pct} className="h-1.5" />
                              </div>
                            )}
                            {trafficData.desktop_pct !== null && (
                              <div className="space-y-1">
                                <div className="flex justify-between text-xs">
                                  <span className="flex items-center gap-1"><Monitor className="h-3 w-3" />דסקטופ</span>
                                  <span className="font-medium">{trafficData.desktop_pct}%</span>
                                </div>
                                <Progress value={trafficData.desktop_pct} className="h-1.5" />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Stats row */}
                        <div className="grid grid-cols-2 gap-4">
                          {trafficData.bounce_rate && (
                            <div className="rounded-lg bg-muted/50 p-3 text-center">
                              <p className="text-xl font-bold">{trafficData.bounce_rate}</p>
                              <p className="text-xs text-muted-foreground">שיעור נטישה</p>
                            </div>
                          )}
                          {trafficData.avg_duration && (
                            <div className="rounded-lg bg-muted/50 p-3 text-center">
                              <p className="text-xl font-bold">{trafficData.avg_duration}</p>
                              <p className="text-xs text-muted-foreground">זמן ממוצע באתר</p>
                            </div>
                          )}
                        </div>

                        {/* Top Countries */}
                        {trafficData.top_countries && trafficData.top_countries.length > 0 && (
                          <div className="rounded-lg border p-4">
                            <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                              <Globe className="h-4 w-4 text-primary" />מדינות מובילות
                            </h4>
                            <div className="flex flex-wrap gap-2">
                              {trafficData.top_countries.map((country, i) => (
                                <Badge key={i} variant="secondary" className="text-sm">
                                  {i + 1}. {country}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {trafficData.data_quality && (
                          <p className="text-xs text-muted-foreground text-center">
                            * הנתונים הם הערכה בלבד מתוצאות חיפוש. אינם נתוני SimilarWeb רשמיים.
                          </p>
                        )}

                        <Button variant="outline" className="w-full" onClick={() => fetchTrafficData(selectedCompetitor)}>
                          <BarChart2 className="ml-2 h-4 w-4" />רענן נתוני תנועה
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 space-y-4">
                        <BarChart2 className="h-12 w-12 text-muted-foreground/50" />
                        <p className="text-muted-foreground">ניתוח תנועה ל-{selectedCompetitor.name}</p>
                        <Button onClick={() => fetchTrafficData(selectedCompetitor)}>
                          <BarChart2 className="ml-2 h-4 w-4" />נתח תנועה
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
