"use client"

import { useState, useEffect } from "react"
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
  Users, 
  MoreHorizontal,
  Mail,
  Phone,
  Eye,
  Loader2,
  Filter,
  Building2,
  MapPin,
} from "lucide-react"

interface Lead {
  id: string
  company_name: string
  contact_name: string
  email: string
  phone: string
  source: string
  score: number
  status: string
  discovery_reason: string
  created_at: string
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [industryFilter, setIndustryFilter] = useState<string>("all")
  const [cityFilter, setCityFilter] = useState<string>("all")
  const supabase = createClient()

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

  const getScoreColor = (score: number) => {
    if (score >= 80) return "bg-green-500/20 text-green-400 border-green-500/30"
    if (score >= 60) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
    return "bg-red-500/20 text-red-400 border-red-500/30"
  }

  const getScoreProgressColor = (score: number) => {
    if (score >= 80) return "[&>div]:bg-green-500"
    if (score >= 60) return "[&>div]:bg-yellow-500"
    return "[&>div]:bg-red-500"
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "חדש":
        return "bg-blue-500/20 text-blue-400"
      case "בטיפול":
        return "bg-purple-500/20 text-purple-400"
      case "מעוניין":
        return "bg-green-500/20 text-green-400"
      case "לא רלוונטי":
        return "bg-gray-500/20 text-gray-400"
      default:
        return "bg-gray-500/20 text-gray-400"
    }
  }

  // For demo, we'll use source as a proxy for industry
  const industries = [...new Set(leads.map(l => l.source))]
  const cities = ["תל אביב", "ירושלים", "חיפה", "באר שבע", "רמת גן"]

  const filteredLeads = leads.filter((lead) => {
    if (industryFilter !== "all" && lead.source !== industryFilter) return false
    // City filter would work if we had city data
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
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Users className="ml-2 h-4 w-4" />
          ייצא לידים
        </Button>
      </div>

      {/* Filters */}
      <Card className="border-border bg-card">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">סינון:</span>
            </div>
            
            <Select value={industryFilter} onValueChange={setIndustryFilter}>
              <SelectTrigger className="w-40 bg-secondary/50">
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

            <Select value={cityFilter} onValueChange={setCityFilter}>
              <SelectTrigger className="w-40 bg-secondary/50">
                <SelectValue placeholder="עיר" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל הערים</SelectItem>
                {cities.map((city) => (
                  <SelectItem key={city} value={city}>
                    {city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Leads Table */}
      <Card className="border-border bg-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-right">חברה</TableHead>
                <TableHead className="text-right">תעשייה</TableHead>
                <TableHead className="text-right hidden md:table-cell">עיר</TableHead>
                <TableHead className="text-right hidden lg:table-cell">סיבת גילוי</TableHead>
                <TableHead className="text-right">ציון ליד</TableHead>
                <TableHead className="text-right hidden sm:table-cell">מקור</TableHead>
                <TableHead className="text-right">פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLeads.map((lead) => (
                <TableRow key={lead.id} className="border-border">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                        <Building2 className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{lead.company_name}</p>
                        <p className="text-xs text-muted-foreground">{lead.contact_name}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="bg-secondary/50">
                      טכנולוגיה
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      תל אביב
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <span className="text-sm text-muted-foreground">
                      {lead.discovery_reason || "ביקור באתר"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="w-32 space-y-1">
                      <div className="flex items-center justify-between">
                        <Badge 
                          variant="outline" 
                          className={`text-xs ${getScoreColor(lead.score)}`}
                        >
                          {lead.score}
                        </Badge>
                      </div>
                      <Progress 
                        value={lead.score} 
                        className={`h-1.5 ${getScoreProgressColor(lead.score)}`} 
                      />
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant="outline" className={getStatusBadge(lead.status)}>
                      {lead.source}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <Eye className="ml-2 h-4 w-4" />
                          צפה בפרטים
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Mail className="ml-2 h-4 w-4" />
                          שלח מייל
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Phone className="ml-2 h-4 w-4" />
                          התקשר
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
        <Card className="border-border bg-card">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">לא נמצאו לידים מתאימים</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
