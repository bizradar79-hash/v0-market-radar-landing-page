"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Users,
  MoreHorizontal,
  Eye,
  Loader2,
  Filter,
  Building2,
  Sparkles,
  Trash2,
  ExternalLink,
  Star,
  TrendingUp,
  Flame,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import AIOpportunityCard, { type AIOpportunity } from "@/components/opportunities/AIOpportunityCard"

// ── Helpers ────────────────────────────────────────────────────────────────

function getHostname(url: string): string {
  try {
    const u = url.startsWith('http') ? url : `https://${url}`
    return new URL(u).hostname
  } catch {
    return url
  }
}

const STATUSES: AIOpportunity['status'][] = ['חדש', 'בבדיקה', 'בפעולה', 'נסגר']

const columnBorder: Record<string, string> = {
  'חדש':    'border-l-blue-400',
  'בבדיקה': 'border-l-yellow-400',
  'בפעולה': 'border-l-green-400',
  'נסגר':   'border-l-gray-400',
}

// ── Types ──────────────────────────────────────────────────────────────────

interface Lead {
  id: string
  company_id: string
  name: string
  website: string
  industry: string
  location: string
  reason: string
  score: number
  source: string
  created_at: string
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function OpportunitiesPage() {
  // AI Opportunities state
  const [opportunities, setOpportunities] = useState<AIOpportunity[]>([])
  const [oppLoading, setOppLoading] = useState(true)
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'score' | 'date' | 'revenue'>('score')

  // Leads state
  const [leads, setLeads] = useState<Lead[]>([])
  const [leadsLoading, setLeadsLoading] = useState(true)
  const [discovering, setDiscovering] = useState(false)
  const [industryFilter, setIndustryFilter] = useState<string>("all")
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)

  const supabase = createClient()
  const { toast } = useToast()

  // ── AI Opportunities fetch + refresh ────────────────────────────────────

  const fetchOpportunities = useCallback(async () => {
    try {
      const res = await fetch('/api/ai-opportunities')
      const json = await res.json()
      if (json.opportunities) setOpportunities(json.opportunities)
    } catch {
      // silent
    } finally {
      setOppLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOpportunities()
    // Fire-and-forget refresh check (returns immediately if cache is valid)
    fetch('/api/ai-opportunities/refresh', { method: 'POST' })
      .then(r => r.json())
      .then(json => { if (json.success && !json.skipped) fetchOpportunities() })
      .catch(() => {})
  }, [fetchOpportunities])

  // ── Leads fetch ─────────────────────────────────────────────────────────

  const fetchLeads = useCallback(async () => {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("score", { ascending: false })
    if (!error && data) setLeads(data)
    setLeadsLoading(false)
  }, [supabase])

  useEffect(() => { fetchLeads() }, [fetchLeads])

  // ── AI Opportunity handlers ──────────────────────────────────────────────

  function handleStatusChange(id: string, status: AIOpportunity['status']) {
    setOpportunities(prev => prev.map(o => o.id === id ? { ...o, status } : o))
    fetch(`/api/ai-opportunities/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }).catch(() => {})
  }

  function handleDelete(id: string) {
    setOpportunities(prev => prev.filter(o => o.id !== id))
    fetch(`/api/ai-opportunities/${id}`, { method: 'DELETE' }).catch(() => {})
  }

  function handleNotesSave(id: string, notes: string) {
    setOpportunities(prev => prev.map(o => o.id === id ? { ...o, notes } : o))
    fetch(`/api/ai-opportunities/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    }).catch(() => {})
  }

  // ── Leads handlers ──────────────────────────────────────────────────────

  async function discoverWithAI() {
    setDiscovering(true)
    try {
      const response = await fetch("/api/generate-leads", { method: "POST" })
      const data = await response.json()
      if (data.success) {
        await fetchLeads()
        toast({ title: "גילוי הושלם!", description: `נמצאו ${data.count || 0} לידים חדשים` })
      } else {
        toast({ title: "לא נמצאו לידים", description: data.error || "נסה לעדכן את פרטי החברה בהגדרות", variant: "destructive" })
      }
    } catch {
      toast({ title: "שגיאה", description: "אירעה שגיאה בעת הגילוי", variant: "destructive" })
    } finally {
      setDiscovering(false)
    }
  }

  async function deleteLead(id: string) {
    const { error } = await supabase.from("leads").delete().eq("id", id)
    if (!error) {
      setLeads(leads.filter(l => l.id !== id))
      setSelectedLead(null)
      toast({ title: "הליד נמחק" })
    }
  }

  // ── Derived state ────────────────────────────────────────────────────────

  const activeOpps = opportunities.filter(o => o.status !== 'נסגר')

  const summaryStats = {
    totalRevenue: activeOpps.reduce((sum, o) => sum + (o.estimated_revenue_max || 0), 0),
    avgScore: activeOpps.length
      ? Math.round(activeOpps.reduce((sum, o) => sum + o.revenue_potential_score, 0) / activeOpps.length)
      : 0,
    activeCount: activeOpps.length,
    heatingCount: activeOpps.filter(o => o.heat_status === 'heating').length,
  }

  const filteredOpps = opportunities
    .filter(o => sourceFilter === 'all' || o.source_type === sourceFilter)
    .filter(o => statusFilter === 'all' || o.status === statusFilter)
    .sort((a, b) => {
      if (sortBy === 'score') return b.revenue_potential_score - a.revenue_potential_score
      if (sortBy === 'revenue') return b.estimated_revenue_max - a.estimated_revenue_max
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

  const oppsByStatus = STATUSES.reduce<Record<string, AIOpportunity[]>>((acc, s) => {
    acc[s] = filteredOpps.filter(o => o.status === s)
    return acc
  }, {} as Record<string, AIOpportunity[]>)

  const industries = [...new Set(leads.map(l => l.industry || l.source))]
  const filteredLeads = leads.filter(l =>
    industryFilter === 'all' || (l.industry || l.source) === industryFilter
  )

  function getScoreColor(score: number) {
    if (score >= 80) return "bg-green-100 text-green-700 border-green-200"
    if (score >= 60) return "bg-yellow-100 text-yellow-700 border-yellow-200"
    return "bg-red-100 text-red-700 border-red-200"
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8" dir="rtl">

      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">מרכז הזדמנויות ⭐</h1>
        <p className="text-muted-foreground text-sm mt-1">
          כל ההזדמנויות שזוהו על ידי AI — ניהול, מעקב וניצול
        </p>
      </div>

      {/* ── PART 3: Summary Bar ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">סה״כ פוטנציאל חודשי</p>
            <p className="text-xl font-bold text-emerald-700">
              ₪{summaryStats.totalRevenue.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/40">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> ציון ממוצע
            </p>
            <p className="text-xl font-bold text-blue-700">{summaryStats.avgScore}</p>
          </CardContent>
        </Card>
        <Card className="border-violet-200 bg-violet-50/40">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <Star className="h-3 w-3" /> הזדמנויות פעילות
            </p>
            <p className="text-xl font-bold text-violet-700">{summaryStats.activeCount}</p>
          </CardContent>
        </Card>
        <Card className="border-orange-200 bg-orange-50/40">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <Flame className="h-3 w-3" /> מתחממות 🔥
            </p>
            <p className="text-xl font-bold text-orange-700">{summaryStats.heatingCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* ── PART 1: AI Opportunities Pipeline ──────────────────────────── */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">צינור הזדמנויות AI</h2>

        {oppLoading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>טוען הזדמנויות...</span>
          </div>
        ) : opportunities.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-3">
              <Star className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-muted-foreground">טרם שמרת הזדמנויות.</p>
              <Link href="/app/dashboard">
                <Button variant="outline">גלה הזדמנויות בדשבורד ←</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Source filter */}
              <div className="flex gap-1">
                {(['all', 'weekly', 'niche', 'market_analysis'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setSourceFilter(s)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${sourceFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
                  >
                    {s === 'all' ? 'כולם' : s === 'weekly' ? 'שבועי' : s === 'niche' ? 'נישה' : 'ניתוח שוק'}
                  </button>
                ))}
              </div>

              <div className="w-px h-5 bg-border hidden sm:block" />

              {/* Status filter */}
              <div className="flex gap-1">
                {(['all', ...STATUSES] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${statusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
                  >
                    {s === 'all' ? 'כל הסטטוסים' : s}
                  </button>
                ))}
              </div>

              <div className="mr-auto">
                <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                  <SelectTrigger className="h-7 text-xs w-40" dir="rtl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="score">ציון גבוה</SelectItem>
                    <SelectItem value="date">תאריך חדש</SelectItem>
                    <SelectItem value="revenue">פוטנציאל הכנסה</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Kanban board */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {STATUSES.map(status => (
                <div key={status} className={`rounded-lg border-2 border-l-4 bg-muted/20 p-3 ${columnBorder[status]}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold">{status}</h3>
                    <span className="text-xs text-muted-foreground bg-background rounded-full px-2 py-0.5 border">
                      {oppsByStatus[status]?.length || 0}
                    </span>
                  </div>
                  <div className="space-y-3 min-h-[80px]">
                    {oppsByStatus[status]?.length === 0 ? (
                      <p className="text-xs text-muted-foreground/60 text-center py-6">אין הזדמנויות בשלב זה</p>
                    ) : (
                      oppsByStatus[status].map(opp => (
                        <AIOpportunityCard
                          key={opp.id}
                          opportunity={opp}
                          onStatusChange={handleStatusChange}
                          onDelete={handleDelete}
                          onNotesSave={handleNotesSave}
                        />
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── PART 2: Collaboration Recommendations (Leads) ──────────────── */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">המלצות לשיתופי פעולה</h2>
          <p className="text-sm text-muted-foreground">לידים פוטנציאליים שזוהו על ידי AI</p>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">{filteredLeads.length} לידים פוטנציאליים</p>
          <Button onClick={discoverWithAI} disabled={discovering} size="sm">
            {discovering ? (
              <><Loader2 className="ml-2 h-4 w-4 animate-spin" />מחפש לידים...</>
            ) : (
              <><Sparkles className="ml-2 h-4 w-4" />גלה לידים חדשים עם AI</>
            )}
          </Button>
        </div>

        {/* Industry filter */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">סינון:</span>
              </div>
              <Select value={industryFilter} onValueChange={setIndustryFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="תעשייה" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל התעשיות</SelectItem>
                  {industries.map(industry => (
                    <SelectItem key={industry} value={industry}>{industry}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {leadsLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">חברה</TableHead>
                      <TableHead className="text-right">תעשייה</TableHead>
                      <TableHead className="text-right hidden lg:table-cell">סיבת גילוי</TableHead>
                      <TableHead className="text-right">ציון ליד</TableHead>
                      <TableHead className="text-right">פעולות</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLeads.map(lead => (
                      <TableRow key={lead.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                              <Building2 className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium">{lead.name}</p>
                              {lead.website && (
                                <a
                                  href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-teal-600 hover:underline truncate block max-w-[180px]"
                                >
                                  {getHostname(lead.website)}
                                </a>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{lead.industry || "טכנולוגיה"}</Badge>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <span className="max-w-[250px] whitespace-normal line-clamp-3 text-sm text-muted-foreground block">
                            {lead.reason || "ביקור באתר"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="w-32 space-y-1">
                            <Badge variant="outline" className={`text-xs ${getScoreColor(lead.score)}`}>
                              {lead.score}
                            </Badge>
                            <Progress value={lead.score} className="h-1.5" />
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
                              <DropdownMenuItem onClick={() => setSelectedLead(lead)}>
                                <Eye className="ml-2 h-4 w-4" />צפה בפרטים
                              </DropdownMenuItem>
                              {lead.website && (
                                <DropdownMenuItem asChild>
                                  <a href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="ml-2 h-4 w-4" />פתח אתר
                                  </a>
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => deleteLead(lead.id)} className="text-red-600">
                                <Trash2 className="ml-2 h-4 w-4" />מחק
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {filteredLeads.length === 0 && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Users className="h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-4 text-muted-foreground">לא נמצאו לידים מתאימים</p>
                  <Button className="mt-4" onClick={discoverWithAI} disabled={discovering}>
                    <Sparkles className="ml-2 h-4 w-4" />גלה לידים עם AI
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      {/* Lead Details Modal */}
      <Dialog open={!!selectedLead} onOpenChange={() => setSelectedLead(null)}>
        <DialogContent className="max-w-lg" dir="rtl">
          {selectedLead && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  {selectedLead.name}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">תעשייה</p>
                    <p className="font-medium">{selectedLead.industry || "טכנולוגיה"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">ציון ליד</p>
                    <Badge variant="outline" className={getScoreColor(selectedLead.score)}>
                      {selectedLead.score}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">מקור</p>
                    <p className="font-medium">{selectedLead.source}</p>
                  </div>
                </div>
                {selectedLead.reason && (
                  <div>
                    <p className="text-sm text-muted-foreground">סיבת גילוי</p>
                    <p>{selectedLead.reason}</p>
                  </div>
                )}
                <div className="flex gap-2 pt-4 border-t">
                  {selectedLead.website && (
                    <Button variant="outline" asChild>
                      <a href={selectedLead.website.startsWith('http') ? selectedLead.website : `https://${selectedLead.website}`} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="ml-2 h-4 w-4" />פתח אתר
                      </a>
                    </Button>
                  )}
                  <Button variant="outline" className="text-red-600" onClick={() => deleteLead(selectedLead.id)}>
                    <Trash2 className="ml-2 h-4 w-4" />מחק
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
