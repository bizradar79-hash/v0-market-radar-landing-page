"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent } from "@/components/ui/card"
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
  Trash2,
  ExternalLink,
  Star,
  TrendingUp,
  Flame,
  ChevronLeft,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import type { SavedOpportunity } from "@/types/saved-opportunity"
import SavedOpportunityDetailsPanel from "@/components/opportunities/SavedOpportunityDetailsPanel"

// ── Helpers ────────────────────────────────────────────────────────────────

function getHostname(url: string): string {
  try {
    const u = url.startsWith('http') ? url : `https://${url}`
    return new URL(u).hostname
  } catch {
    return url
  }
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
  // Saved Opportunities state
  const [savedOpps, setSavedOpps] = useState<SavedOpportunity[]>([])
  const [savedLoading, setSavedLoading] = useState(true)
  const [selectedSavedOpp, setSelectedSavedOpp] = useState<SavedOpportunity | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)

  // Leads state
  const [leads, setLeads] = useState<Lead[]>([])
  const [leadsLoading, setLeadsLoading] = useState(true)
  const [industryFilter, setIndustryFilter] = useState<string>("all")
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)

  const supabase = createClient()
  const { toast } = useToast()

  // ── Saved Opportunities fetch ────────────────────────────────────────────

  const fetchSavedOpps = useCallback(async () => {
    try {
      const res = await fetch('/api/saved-opportunities')
      const json = await res.json()
      if (json.opportunities) setSavedOpps(json.opportunities)
    } catch {
      // silent
    } finally {
      setSavedLoading(false)
    }
  }, [])

  useEffect(() => { fetchSavedOpps() }, [fetchSavedOpps])

  function handleSavedDelete(id: string) {
    setSavedOpps(prev => prev.filter(o => o.id !== id))
    fetch(`/api/saved-opportunities/${id}`, { method: 'DELETE' }).catch(() => {})
  }

  function handleSavedNotes(id: string, notes: string) {
    setSavedOpps(prev => prev.map(o => o.id === id ? { ...o, user_notes: notes } : o))
    fetch(`/api/saved-opportunities/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_notes: notes }),
    }).catch(() => {})
  }

  function openDetails(opp: SavedOpportunity) {
    setSelectedSavedOpp(opp)
    setDetailsOpen(true)
  }

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

  // ── Leads handlers ──────────────────────────────────────────────────────


  async function deleteLead(id: string) {
    const { error } = await supabase.from("leads").delete().eq("id", id)
    if (!error) {
      setLeads(leads.filter(l => l.id !== id))
      setSelectedLead(null)
      toast({ title: "הליד נמחק" })
    }
  }

  // ── Derived state ────────────────────────────────────────────────────────

  const activeOpps = savedOpps.filter(o => o.status !== 'נסגר')

  const summaryStats = {
    totalRevenue: activeOpps.reduce((sum, o) => sum + (o.estimated_revenue_max || 0), 0),
    avgScore: activeOpps.length
      ? Math.round(activeOpps.reduce((sum, o) => sum + o.revenue_potential_score, 0) / activeOpps.length)
      : 0,
    activeCount: activeOpps.length,
    heatingCount: 0,
  }

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
    <div className="space-y-8 overflow-x-hidden" dir="rtl">

      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">מרכז הזדמנויות ⭐</h1>
        <p className="text-muted-foreground text-sm mt-1">
          כל ההזדמנויות שזוהו על ידי AI — ניהול, מעקב וניצול
        </p>
      </div>

      {/* ── Summary Bar ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">סה״כ פוטנציאל חודשי</p>
            <p className="text-xl font-bold text-emerald-700">
              {savedLoading ? '...' : `₪${summaryStats.totalRevenue.toLocaleString()}`}
            </p>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/40">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> ציון ממוצע
            </p>
            <p className="text-xl font-bold text-blue-700">{savedLoading ? '...' : summaryStats.avgScore}</p>
          </CardContent>
        </Card>
        <Card className="border-violet-200 bg-violet-50/40">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <Star className="h-3 w-3" /> הזדמנויות פעילות
            </p>
            <p className="text-xl font-bold text-violet-700">{savedLoading ? '...' : summaryStats.activeCount}</p>
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

      {/* ── הזדמנויות שמורות ────────────────────────────────────────────── */}
      <SavedOpportunitiesSection
        items={savedOpps}
        loading={savedLoading}
        onDelete={handleSavedDelete}
        onNotesSave={handleSavedNotes}
        onDetails={openDetails}
      />

      {/* ── Collaboration Recommendations (Leads) ──────────────────────── */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">שותפים ולידים פוטנציאליים</h2>
          <p className="text-sm text-muted-foreground">לידים פוטנציאליים שזוהו על ידי AI</p>
        </div>

        <p className="text-sm text-muted-foreground">{filteredLeads.length} לידים פוטנציאליים</p>

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
              <CardContent className="p-0 overflow-x-auto">
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
                          <div className="min-w-[72px] w-24 space-y-1">
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
                  <p className="mt-1 text-xs text-muted-foreground">הלידים יתעדכנו אוטומטית בסנכרון השבועי</p>
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
                <div className="flex flex-wrap gap-2 pt-4 border-t">
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

      {/* Saved Opportunity Details Panel */}
      <SavedOpportunityDetailsPanel
        opp={selectedSavedOpp}
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        onNotesSave={handleSavedNotes}
      />
    </div>
  )
}

// ── SavedOpportunitiesSection ─────────────────────────────────────────────

const sourceLabel: Record<string, string> = {
  weekly_action:   'שבועי 🚀',
  niche:           'נישה 🔍',
  market_analysis: 'ניתוח שוק 📊',
}

const sourceBadgeColor: Record<string, string> = {
  weekly_action:   'bg-yellow-100 text-yellow-700 border-yellow-200',
  niche:           'bg-blue-100 text-blue-700 border-blue-200',
  market_analysis: 'bg-teal-100 text-teal-700 border-teal-200',
}

function formatSavedDate(iso: string): string {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}.${mm}.${yyyy}`
}

function scoreBarColor(score: number): string {
  if (score >= 75) return 'bg-orange-500'
  if (score >= 50) return 'bg-green-500'
  if (score >= 25) return 'bg-blue-500'
  return 'bg-gray-400'
}

interface SavedSectionProps {
  items: SavedOpportunity[]
  loading: boolean
  onDelete: (id: string) => void
  onNotesSave: (id: string, notes: string) => void
  onDetails: (opp: SavedOpportunity) => void
}

function SavedOpportunitiesSection({ items, loading, onDelete, onNotesSave, onDetails }: SavedSectionProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">הזדמנויות שמורות</h2>

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-muted-foreground justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">טוען...</span>
        </div>
      ) : items.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-10 text-center gap-3">
            <Star className="h-9 w-9 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">טרם שמרת הזדמנויות.</p>
            <Link href="/app/dashboard">
              <Button variant="outline" size="sm">גלה הזדמנויות בדשבורד ←</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map(opp => (
            <SavedOpportunityRow
              key={opp.id}
              opp={opp}
              onDelete={onDelete}
              onNotesSave={onNotesSave}
              onDetails={onDetails}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SavedOpportunityRow({
  opp, onDelete, onNotesSave, onDetails,
}: {
  opp: SavedOpportunity
  onDelete: (id: string) => void
  onNotesSave: (id: string, notes: string) => void
  onDetails: (opp: SavedOpportunity) => void
}) {
  const [notes, setNotes] = useState(opp.user_notes || '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  function handleNotesBlur() {
    if (notes !== opp.user_notes) onNotesSave(opp.id, notes)
  }

  return (
    <Card className="border-border hover:shadow-sm transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-3 flex-wrap">
          {/* Source badge */}
          <Badge variant="outline" className={`text-xs shrink-0 ${sourceBadgeColor[opp.source_type] || ''}`}>
            {sourceLabel[opp.source_type] || opp.source_type}
          </Badge>

          {/* Title + meta + notes */}
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm">{opp.title}</p>
              <Badge variant="outline" className="text-xs text-muted-foreground">{opp.status}</Badge>
              <span className="text-xs text-muted-foreground">נשמר: {formatSavedDate(opp.saved_at)}</span>
            </div>

            {opp.revenue_potential_score > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-20 shrink-0">פוטנציאל</span>
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full ${scoreBarColor(opp.revenue_potential_score)}`}
                    style={{ width: `${Math.min(100, opp.revenue_potential_score)}%` }}
                  />
                </div>
                <span className="text-xs font-medium w-6 text-right">{opp.revenue_potential_score}</span>
              </div>
            )}

            {(opp.estimated_revenue_min > 0 || opp.estimated_revenue_max > 0) && (
              <p className="text-xs text-muted-foreground break-words">
                ₪{opp.estimated_revenue_min.toLocaleString()} – ₪{opp.estimated_revenue_max.toLocaleString()} / חודש
              </p>
            )}

            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={handleNotesBlur}
              placeholder="הוסף הערה..."
              rows={1}
              className="w-full text-xs rounded border border-border bg-muted/30 px-2 py-1 text-right resize-none focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/50"
              dir="rtl"
            />
          </div>

          {/* Actions */}
          <div className="shrink-0 flex flex-col items-end gap-2 self-start">
            <button
              onClick={() => onDetails(opp)}
              className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
            >
              פרטים
              <ChevronLeft className="h-3 w-3" />
            </button>
            {confirmDelete ? (
              <div className="flex items-center gap-1.5">
                <button onClick={() => onDelete(opp.id)} className="text-xs text-red-600 hover:text-red-700 font-medium">מחק</button>
                <button onClick={() => setConfirmDelete(false)} className="text-xs text-muted-foreground hover:text-foreground">ביטול</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="text-muted-foreground hover:text-red-500 transition-colors p-1" title="מחק">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
