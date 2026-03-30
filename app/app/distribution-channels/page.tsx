"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from "react"
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
  Truck,
  CheckCircle2,
  Circle,
  Loader2,
  Info,
  Sparkles,
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

// ── Channel metadata ───────────────────────────────────────────────────────

const CHANNEL_META: Record<string, { description: string; potential: 'גבוה' | 'בינוני' | 'נמוך' }> = {
  "אתר אינטרנט": { description: "נוכחות דיגיטלית ישירה — לקוחות מוצאים אתכם בגוגל ומבצעים פעולה", potential: "גבוה" },
  "מכירה ישירה": { description: "פגישות, שיחות ומכירה face-to-face עם לקוחות פוטנציאליים", potential: "גבוה" },
  "רשתות חברתיות": { description: "Instagram, Facebook, LinkedIn — בניית קהל ולידים אורגניים", potential: "גבוה" },
  "מפיצים": { description: "שותפי הפצה שמוכרים את המוצר שלכם ללקוחותיהם", potential: "בינוני" },
  "שותפים עסקיים": { description: "הסכמי שיתוף פעולה שמניבים הפניות הדדיות", potential: "גבוה" },
  "חנויות": { description: "נקודות מכירה פיזיות — ישירות או דרך קמעונאים", potential: "בינוני" },
  "B2B פגישות": { description: "תהליך מכירה מול לקוחות עסקיים בפגישות ומצגות", potential: "גבוה" },
  "קטלוגים": { description: "חומרי שיווק פיזיים/דיגיטליים שמציגים את המוצרים", potential: "נמוך" },
  "פלטפורמות מקוונות": { description: "מכירה דרך מרקטפלייסים — Amazon, Yad2, אחרים", potential: "בינוני" },
}

function getChannelMeta(name: string) {
  return CHANNEL_META[name] ?? {
    description: `ערוץ הפצה: ${name}`,
    potential: "בינוני" as const,
  }
}

const POTENTIAL_COLOR = {
  "גבוה": "bg-green-100 text-green-700 border-green-200",
  "בינוני": "bg-yellow-100 text-yellow-700 border-yellow-200",
  "נמוך": "bg-gray-100 text-gray-500 border-gray-200",
}

const ACTIVE_KEY = "distribution_channels_active"

function loadActive(): Set<string> {
  try {
    const stored = localStorage.getItem(ACTIVE_KEY)
    return stored ? new Set(JSON.parse(stored)) : new Set()
  } catch { return new Set() }
}

function saveActive(active: Set<string>) {
  localStorage.setItem(ACTIVE_KEY, JSON.stringify([...active]))
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function DistributionChannelsPage() {
  const [channels, setChannels] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [extracting, setExtracting] = useState(false)
  const [active, setActive] = useState<Set<string>>(new Set())
  const [syncDates, setSyncDates] = useState<{ last_sync_at: string | null; next_sync_at: string | null } | null>(null)

  // Leads state
  const [leads, setLeads] = useState<Lead[]>([])
  const [leadsLoading, setLeadsLoading] = useState(true)
  const [industryFilter, setIndustryFilter] = useState<string>("all")
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)

  const supabase = createClient()
  const { toast } = useToast()

  useEffect(() => {
    setActive(loadActive())
    loadChannels()
  }, [])

  const fetchLeads = useCallback(async () => {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("score", { ascending: false })
    if (!error && data) setLeads(data)
    setLeadsLoading(false)
  }, [supabase])

  useEffect(() => { fetchLeads() }, [fetchLeads])

  async function extractWithAI() {
    setExtracting(true)
    try {
      const res = await fetch('/api/extract-distribution-channels', { method: 'POST' })
      const data = await res.json()
      if (data.channels?.length) {
        setChannels(data.channels)
      }
    } catch { /* silent */ }
    setExtracting(false)
  }

  async function loadChannels() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase
      .from('companies')
      .select('distribution_channels, business_profile, business_overview, last_sync_at, next_sync_at')
      .eq('id', user.id)
      .single()
    if (data?.distribution_channels && Array.isArray(data.distribution_channels) && data.distribution_channels.length > 0) {
      setChannels(data.distribution_channels)
    } else if ((data as any)?.business_profile?.distributionChannels?.length) {
      setChannels((data as any).business_profile.distributionChannels)
    }
    if (data) setSyncDates({ last_sync_at: (data as any).last_sync_at ?? null, next_sync_at: (data as any).next_sync_at ?? null })
    setLoading(false)
  }

  async function deleteLead(id: string) {
    const { error } = await supabase.from("leads").delete().eq("id", id)
    if (!error) {
      setLeads(leads.filter(l => l.id !== id))
      setSelectedLead(null)
      toast({ title: "הליד נמחק" })
    }
  }

  function toggleActive(name: string) {
    setActive(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      saveActive(next)
      return next
    })
  }

  const industries = [...new Set(leads.map(l => l.industry || l.source))]
  const filteredLeads = leads.filter(l =>
    industryFilter === 'all' || (l.industry || l.source) === industryFilter
  )

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-8" dir="rtl">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Truck className="h-6 w-6 text-primary" />ערוצי הפצה
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          הערוצים שדרכם העסק שלך מגיע ללקוחות — מזוהים אוטומטית מהפרופיל העסקי
        </p>
        {syncDates && (
          <p className="text-xs text-muted-foreground mt-1">
            עודכן: {syncDates.last_sync_at ? new Date(syncDates.last_sync_at).toLocaleDateString('he-IL') : '—'} | עדכון הבא: {syncDates.next_sync_at ? new Date(syncDates.next_sync_at).toLocaleDateString('he-IL') : '—'}
          </p>
        )}
      </div>

      {/* ── Channel Cards ──────────────────────────────────────────────────── */}
      {channels.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Truck className="h-10 w-10 text-muted-foreground/40" />
            <div>
              <p className="font-medium">ערוצי הפצה לא זוהו עדיין</p>
              <p className="text-sm text-muted-foreground mt-1">
                ערוצי ההפצה מזוהים אוטומטית מהפרופיל העסקי שלך
              </p>
            </div>
            <Button
              onClick={extractWithAI}
              disabled={extracting}
              variant="outline"
              className="mt-2"
            >
              {extracting
                ? <><Loader2 className="ml-2 h-4 w-4 animate-spin" />מחלץ...</>
                : <><Sparkles className="ml-2 h-4 w-4" />זהה ערוצי הפצה עם AI</>
              }
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Info className="h-4 w-4 shrink-0" />
            <span>סמן ערוצים שאתה כבר משתמש בהם — זה יעזור לאסטרטגיית הצמיחה שלך</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {channels.map((channel) => {
              const meta = getChannelMeta(channel)
              const isActive = active.has(channel)
              return (
                <Card
                  key={channel}
                  className={`transition-all ${isActive ? 'border-primary/40 bg-primary/5 shadow-sm' : 'hover:shadow-sm'}`}
                >
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="flex items-center justify-between text-sm">
                      <span className="font-semibold">{channel}</span>
                      <Badge className={`text-xs border ${POTENTIAL_COLOR[meta.potential]}`}>
                        {meta.potential}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-3">
                    <p className="text-xs text-muted-foreground leading-relaxed">{meta.description}</p>
                    <Button
                      size="sm"
                      variant={isActive ? "default" : "outline"}
                      className="w-full"
                      onClick={() => toggleActive(channel)}
                    >
                      {isActive
                        ? <><CheckCircle2 className="ml-2 h-3.5 w-3.5" />פעיל</>
                        : <><Circle className="ml-2 h-3.5 w-3.5" />סמן כפעיל</>
                      }
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {active.size} מתוך {channels.length} ערוצים מסומנים כפעילים
          </p>
        </>
      )}

      {/* ── ערוצי הפצה פוטנציאליים (Leads) ───────────────────────────────── */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">ערוצי הפצה פוטנציאליים</h2>
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
    </div>
  )
}
