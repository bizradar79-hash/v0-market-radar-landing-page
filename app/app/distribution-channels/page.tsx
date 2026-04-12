"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from "react"
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
  Truck,
  Loader2,
  Users,
  MoreHorizontal,
  Eye,
  Filter,
  Building2,
  Trash2,
  ExternalLink,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

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

// ── Helpers ────────────────────────────────────────────────────────────────

function getHostname(url: string): string {
  try {
    const u = url.startsWith('http') ? url : `https://${url}`
    return new URL(u).hostname
  } catch {
    return url
  }
}

function getScoreColor(score: number) {
  if (score >= 80) return "bg-green-100 text-green-700 border-green-200"
  if (score >= 60) return "bg-yellow-100 text-yellow-700 border-yellow-200"
  return "bg-red-100 text-red-700 border-red-200"
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function DistributionChannelsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [leadsLoading, setLeadsLoading] = useState(true)
  const [industryFilter, setIndustryFilter] = useState<string>("all")
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [savedTitles, setSavedTitles] = useState<Set<string>>(new Set())

  const supabase = createClient()
  const { toast } = useToast()

  const fetchLeads = useCallback(async () => {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("score", { ascending: false })
    if (!error && data) setLeads(data)
    setLeadsLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchLeads()
    fetchSaved()
  }, [fetchLeads])

  async function fetchSaved() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('saved_items').select('title').eq('company_id', user.id).eq('item_type', 'channel')
    if (data) setSavedTitles(new Set(data.map((s: any) => s.title)))
  }

  async function saveLead(lead: Lead) {
    setSavedTitles(prev => new Set([...prev, lead.name]))
    try {
      await fetch('/api/saved-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_type: 'channel',
          item_id: lead.id,
          title: lead.name,
          description: lead.reason?.slice(0, 160) || null,
          url: lead.website || null,
          source_module: 'ערוצי הפצה',
          metadata: { industry: lead.industry, location: lead.location, score: lead.score },
        }),
      })
      const win = window as any
      if (typeof win.refreshSidebarCounts === 'function') win.refreshSidebarCounts()
    } catch {}
  }

  async function deleteLead(id: string) {
    const { error } = await supabase.from("leads").delete().eq("id", id)
    if (!error) {
      setLeads(leads.filter(l => l.id !== id))
      setSelectedLead(null)
      toast({ title: "הליד נמחק" })
    }
  }

  const industries = [...new Set(leads.map(l => l.industry || l.source))]
  const filteredLeads = leads.filter(l =>
    industryFilter === 'all' || (l.industry || l.source) === industryFilter
  )

  return (
    <div className="space-y-6" dir="rtl">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Truck className="h-6 w-6 text-primary" />ערוצי הפצה
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          לידים פוטנציאליים שזוהו על ידי AI
        </p>
      </div>

      {/* ── ערוצי הפצה פוטנציאליים (Leads) ───────────────────────────────── */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">ערוצי הפצה פוטנציאליים</h2>
          <p className="text-sm text-muted-foreground">{filteredLeads.length} לידים פוטנציאליים</p>
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
                              <DropdownMenuItem onClick={() => saveLead(lead)} disabled={savedTitles.has(lead.name)}>
                                {savedTitles.has(lead.name) ? '✓ נשמר' : '🔖 שמור ערוץ'}
                              </DropdownMenuItem>
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
    </div>
  )
}
