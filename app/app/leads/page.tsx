"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect } from "react"
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
  Sparkles,
  Trash2,
  ExternalLink,
} from "lucide-react"

function getHostname(url: string): string {
  try {
    const u = url.startsWith('http') ? url : `https://${url}`
    return new URL(u).hostname
  } catch {
    return url
  }
}
import { useToast } from "@/hooks/use-toast"

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

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [discovering, setDiscovering] = useState(false)
  const [industryFilter, setIndustryFilter] = useState<string>("all")
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const supabase = createClient()
  const { toast } = useToast()

  useEffect(() => {
    fetchLeads()
  }, [])

  async function fetchLeads() {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("score", { ascending: false })

    if (!error && data) {
      setLeads(data)
    }
    setLoading(false)
  }

  async function discoverWithAI() {
    setDiscovering(true)
    try {
      const response = await fetch("/api/generate-leads", { method: "POST" })
      const data = await response.json()
      
      if (data.success) {
        await fetchLeads()
        toast({
          title: "גילוי הושלם!",
          description: `נמצאו ${data.count || 0} לידים חדשים`,
        })
      } else {
        toast({
          title: "לא נמצאו לידים",
          description: data.error || "נסה לעדכן את פרטי החברה בהגדרות",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error discovering leads:", error)
      toast({
        title: "שגיאה",
        description: "אירעה שגיאה בעת הגילוי",
        variant: "destructive",
      })
    } finally {
      setDiscovering(false)
    }
  }

  async function deleteLead(id: string) {
    const { error } = await supabase
      .from("leads")
      .delete()
      .eq("id", id)
    
    if (!error) {
      setLeads(leads.filter(l => l.id !== id))
      setSelectedLead(null)
      toast({ title: "הליד נמחק" })
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return "bg-green-100 text-green-700 border-green-200"
    if (score >= 60) return "bg-yellow-100 text-yellow-700 border-yellow-200"
    return "bg-red-100 text-red-700 border-red-200"
  }

  const industries = [...new Set(leads.map(l => l.industry || l.source))]

  const filteredLeads = leads.filter((lead) => {
    if (industryFilter !== "all" && (lead.industry || lead.source) !== industryFilter) return false
    return true
  })

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
          <h1 className="text-2xl font-bold text-foreground">לידים</h1>
          <p className="text-muted-foreground">
            {filteredLeads.length} לידים פוטנציאליים
          </p>
        </div>
        <Button onClick={discoverWithAI} disabled={discovering}>
          {discovering ? (
            <>
              <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              מחפש לידים...
            </>
          ) : (
            <>
              <Sparkles className="ml-2 h-4 w-4" />
              גלה לידים חדשים עם AI
            </>
          )}
        </Button>
      </div>

      {/* Filters */}
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
                {industries.map((industry) => (
                  <SelectItem key={industry} value={industry}>
                    {industry}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Leads Table */}
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
              {filteredLeads.map((lead) => (
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
                    <Badge variant="secondary">
                      {lead.industry || "טכנולוגיה"}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <span className="max-w-[250px] whitespace-normal line-clamp-3 text-sm text-muted-foreground block">
                      {lead.reason || "ביקור באתר"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="w-32 space-y-1">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className={`text-xs ${getScoreColor(lead.score)}`}>
                          {lead.score}
                        </Badge>
                      </div>
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
                          <Eye className="ml-2 h-4 w-4" />
                          צפה בפרטים
                        </DropdownMenuItem>
                        {lead.website && (
                          <DropdownMenuItem asChild>
                            <a href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="ml-2 h-4 w-4" />
                              פתח אתר
                            </a>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => deleteLead(lead.id)}
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
        </CardContent>
      </Card>

      {filteredLeads.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">לא נמצאו לידים מתאימים</p>
            <Button className="mt-4" onClick={discoverWithAI} disabled={discovering}>
              <Sparkles className="ml-2 h-4 w-4" />
              גלה לידים עם AI
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Lead Details Modal */}
      <Dialog open={!!selectedLead} onOpenChange={() => setSelectedLead(null)}>
        <DialogContent className="max-w-lg">
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
                        <ExternalLink className="ml-2 h-4 w-4" />
                        פתח אתר
                      </a>
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className="text-red-600"
                    onClick={() => deleteLead(selectedLead.id)}
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
