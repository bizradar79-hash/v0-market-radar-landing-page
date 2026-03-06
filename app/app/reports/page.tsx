"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Download, Calendar, FileText, TrendingUp, Users, Target, Lightbulb, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface ReportData {
  weekRange: string
  generatedAt: string
  companyName: string
  highlights: {
    opportunities: number
    competitors: number
    leads: number
    alerts: number
  }
  topOpportunities: Array<{
    title: string
    impact_score: number
    description: string
  }>
  competitorActivity: Array<{
    name: string
    activity: string
    threat_score: number
  }>
  newLeads: Array<{
    name: string
    score: number
    source: string
  }>
  recommendations: string[]
}

export default function ReportsPage() {
  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const supabase = createClient()
  const { toast } = useToast()

  useEffect(() => {
    fetchReportData()
  }, [])

  async function fetchReportData() {
    // Get counts and data
    const [
      { count: opportunitiesCount },
      { count: competitorsCount },
      { count: leadsCount },
      { count: alertsCount },
      { data: topOpps },
      { data: competitors },
      { data: leads },
      { data: company },
    ] = await Promise.all([
      supabase.from("opportunities").select("*", { count: "exact", head: true }),
      supabase.from("competitors").select("*", { count: "exact", head: true }),
      supabase.from("leads").select("*", { count: "exact", head: true }),
      supabase.from("alerts").select("*", { count: "exact", head: true }).eq("is_read", false),
      supabase.from("opportunities").select("title, impact_score, description").order("impact_score", { ascending: false }).limit(3),
      supabase.from("competitors").select("name, last_activity, threat_score").order("threat_score", { ascending: false }).limit(3),
      supabase.from("leads").select("name, score, source").order("score", { ascending: false }).limit(3),
      supabase.from("companies").select("name").single(),
    ])

    // Generate date range
    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const weekRange = `${weekAgo.toLocaleDateString("he-IL", { day: "numeric", month: "long" })} - ${now.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" })}`
    const generatedAt = now.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })

    // Generate recommendations based on data
    const recommendations: string[] = []
    if ((leadsCount || 0) > 0) {
      recommendations.push("לפנות ללידים בעלי ציון גבוה מ-80 תוך 24 שעות")
    }
    if ((competitorsCount || 0) > 0) {
      recommendations.push("לעקוב אחר פעילות המתחרים ולהכין תגובה")
    }
    if ((opportunitiesCount || 0) > 0) {
      recommendations.push("לבחון את ההזדמנויות המובילות ולפעול בהתאם")
    }
    recommendations.push("להמשיך לעדכן את פרופיל החברה לתוצאות מדויקות יותר")

    setReportData({
      weekRange,
      generatedAt,
      companyName: company?.name || "החברה שלי",
      highlights: {
        opportunities: opportunitiesCount || 0,
        competitors: competitorsCount || 0,
        leads: leadsCount || 0,
        alerts: alertsCount || 0,
      },
      topOpportunities: topOpps || [],
      competitorActivity: competitors?.map(c => ({
        name: c.name,
        activity: c.last_activity || "פעילות כללית",
        threat_score: c.threat_score,
      })) || [],
      newLeads: leads || [],
      recommendations,
    })
    setLoading(false)
  }

  async function generatePDF() {
    if (!reportData) return
    
    setGenerating(true)
    try {
      // Create a printable version of the report
      const printContent = `
        <!DOCTYPE html>
        <html dir="rtl" lang="he">
        <head>
          <meta charset="UTF-8">
          <title>דוח מודיעין שבועי - ${reportData.companyName}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; direction: rtl; }
            h1 { color: #1a1a1a; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; }
            h2 { color: #374151; margin-top: 30px; }
            .header { text-align: center; margin-bottom: 30px; }
            .meta { color: #6b7280; font-size: 14px; }
            .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin: 20px 0; }
            .stat { background: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; }
            .stat-value { font-size: 32px; font-weight: bold; color: #3b82f6; }
            .stat-label { color: #6b7280; font-size: 14px; }
            .item { background: #f9fafb; padding: 15px; border-radius: 8px; margin: 10px 0; border-right: 4px solid #3b82f6; }
            .item-title { font-weight: bold; color: #1a1a1a; }
            .item-desc { color: #6b7280; font-size: 14px; margin-top: 5px; }
            .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; }
            .badge-high { background: #fef3c7; color: #92400e; }
            .badge-medium { background: #dbeafe; color: #1e40af; }
            .recommendations { list-style: none; padding: 0; }
            .recommendations li { background: #eff6ff; padding: 15px; border-radius: 8px; margin: 10px 0; display: flex; align-items: center; gap: 10px; }
            .rec-number { background: #3b82f6; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; }
            @media print { body { padding: 20px; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>דוח מודיעין שבועי</h1>
            <p class="meta">${reportData.weekRange}</p>
            <p class="meta">נוצר: ${reportData.generatedAt}</p>
          </div>

          <div class="grid">
            <div class="stat">
              <div class="stat-value">${reportData.highlights.opportunities}</div>
              <div class="stat-label">הזדמנויות חדשות</div>
            </div>
            <div class="stat">
              <div class="stat-value">${reportData.highlights.competitors}</div>
              <div class="stat-label">מתחרים במעקב</div>
            </div>
            <div class="stat">
              <div class="stat-value">${reportData.highlights.leads}</div>
              <div class="stat-label">לידים חדשים</div>
            </div>
            <div class="stat">
              <div class="stat-value">${reportData.highlights.alerts}</div>
              <div class="stat-label">התראות</div>
            </div>
          </div>

          ${reportData.topOpportunities.length > 0 ? `
            <h2>הזדמנויות מובילות</h2>
            ${reportData.topOpportunities.map(opp => `
              <div class="item">
                <div class="item-title">${opp.title} <span class="badge badge-high">${opp.impact_score}/100</span></div>
                <div class="item-desc">${opp.description || ''}</div>
              </div>
            `).join('')}
          ` : ''}

          ${reportData.competitorActivity.length > 0 ? `
            <h2>פעילות מתחרים</h2>
            ${reportData.competitorActivity.map(comp => `
              <div class="item">
                <div class="item-title">${comp.name} <span class="badge ${comp.threat_score >= 70 ? 'badge-high' : 'badge-medium'}">איום: ${comp.threat_score}</span></div>
                <div class="item-desc">${comp.activity}</div>
              </div>
            `).join('')}
          ` : ''}

          ${reportData.newLeads.length > 0 ? `
            <h2>לידים חדשים</h2>
            ${reportData.newLeads.map(lead => `
              <div class="item">
                <div class="item-title">${lead.name} <span class="badge ${lead.score >= 80 ? 'badge-high' : 'badge-medium'}">ציון: ${lead.score}</span></div>
                <div class="item-desc">מקור: ${lead.source}</div>
              </div>
            `).join('')}
          ` : ''}

          <h2>המלצות</h2>
          <ul class="recommendations">
            ${reportData.recommendations.map((rec, idx) => `
              <li><span class="rec-number">${idx + 1}</span> ${rec}</li>
            `).join('')}
          </ul>
        </body>
        </html>
      `

      // Open print dialog
      const printWindow = window.open('', '_blank')
      if (printWindow) {
        printWindow.document.write(printContent)
        printWindow.document.close()
        printWindow.focus()
        setTimeout(() => {
          printWindow.print()
        }, 250)
      }

      toast({
        title: "הדוח מוכן",
        description: "חלון ההדפסה נפתח - בחר 'שמור כ-PDF' כדי להוריד",
      })
    } catch (error) {
      console.error("Error generating PDF:", error)
      toast({
        title: "שגיאה",
        description: "אירעה שגיאה בעת יצירת הדוח",
        variant: "destructive",
      })
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!reportData) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileText className="h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">לא ניתן לטעון את הדוח</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">דוחות</h1>
          <p className="text-muted-foreground">דוח מודיעין שבועי</p>
        </div>
        <Button onClick={generatePDF} disabled={generating}>
          {generating ? (
            <Loader2 className="ml-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="ml-2 h-4 w-4" />
          )}
          הורד PDF
        </Button>
      </div>

      {/* Report Card */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-xl">
                דוח מודיעין שבועי
              </CardTitle>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {reportData.weekRange}
                </span>
                <span className="flex items-center gap-1">
                  <FileText className="h-4 w-4" />
                  נוצר: {reportData.generatedAt}
                </span>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          {/* Highlights */}
          <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="rounded-lg bg-primary/10 p-4 text-center">
              <Lightbulb className="mx-auto mb-2 h-6 w-6 text-primary" />
              <p className="text-2xl font-bold">{reportData.highlights.opportunities}</p>
              <p className="text-sm text-muted-foreground">הזדמנויות חדשות</p>
            </div>
            <div className="rounded-lg bg-red-100 p-4 text-center">
              <Target className="mx-auto mb-2 h-6 w-6 text-red-600" />
              <p className="text-2xl font-bold">{reportData.highlights.competitors}</p>
              <p className="text-sm text-muted-foreground">מתחרים במעקב</p>
            </div>
            <div className="rounded-lg bg-blue-100 p-4 text-center">
              <Users className="mx-auto mb-2 h-6 w-6 text-blue-600" />
              <p className="text-2xl font-bold">{reportData.highlights.leads}</p>
              <p className="text-sm text-muted-foreground">לידים חדשים</p>
            </div>
            <div className="rounded-lg bg-yellow-100 p-4 text-center">
              <TrendingUp className="mx-auto mb-2 h-6 w-6 text-yellow-600" />
              <p className="text-2xl font-bold">{reportData.highlights.alerts}</p>
              <p className="text-sm text-muted-foreground">התראות</p>
            </div>
          </div>

          {/* Top Opportunities */}
          {reportData.topOpportunities.length > 0 && (
            <div className="mb-8">
              <h3 className="mb-4 text-lg font-semibold">הזדמנויות מובילות</h3>
              <div className="space-y-3">
                {reportData.topOpportunities.map((opp, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded-lg border bg-muted/30 p-4"
                  >
                    <div>
                      <p className="font-medium">{opp.title}</p>
                      <p className="text-sm text-muted-foreground">{opp.description}</p>
                    </div>
                    <Badge variant="secondary">
                      {opp.impact_score}/100
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Competitor Activity */}
          {reportData.competitorActivity.length > 0 && (
            <div className="mb-8">
              <h3 className="mb-4 text-lg font-semibold">פעילות מתחרים</h3>
              <div className="space-y-3">
                {reportData.competitorActivity.map((comp, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded-lg border bg-muted/30 p-4"
                  >
                    <div>
                      <p className="font-medium">{comp.name}</p>
                      <p className="text-sm text-muted-foreground">{comp.activity}</p>
                    </div>
                    <Badge
                      className={
                        comp.threat_score >= 70
                          ? "bg-red-100 text-red-700"
                          : "bg-yellow-100 text-yellow-700"
                      }
                    >
                      איום: {comp.threat_score}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* New Leads */}
          {reportData.newLeads.length > 0 && (
            <div className="mb-8">
              <h3 className="mb-4 text-lg font-semibold">לידים חדשים</h3>
              <div className="space-y-3">
                {reportData.newLeads.map((lead, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded-lg border bg-muted/30 p-4"
                  >
                    <div>
                      <p className="font-medium">{lead.name}</p>
                      <p className="text-sm text-muted-foreground">מקור: {lead.source}</p>
                    </div>
                    <Badge
                      className={
                        lead.score >= 80
                          ? "bg-green-100 text-green-700"
                          : "bg-yellow-100 text-yellow-700"
                      }
                    >
                      ציון: {lead.score}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          <div>
            <h3 className="mb-4 text-lg font-semibold">המלצות</h3>
            <ul className="space-y-2">
              {reportData.recommendations.map((rec, index) => (
                <li
                  key={index}
                  className="flex items-start gap-3 rounded-lg border bg-primary/5 p-4"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {index + 1}
                  </span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
