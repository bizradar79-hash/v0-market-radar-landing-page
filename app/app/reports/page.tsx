"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Download, Calendar, FileText, TrendingUp, TrendingDown, Minus, Users, Target, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface Company {
  name: string
  industry: string
  website: string
  city: string
  description: string
}

interface Competitor {
  name: string
  website: string
  services: string
  threat_score: number
  positioning: string
}

interface Lead {
  name: string
  website: string
  industry: string
  score: number
  reason: string
  source: string
}

interface Tender {
  title: string
  organization: string
  deadline: string
  budget: string
  description: string
  relevance_score: number
}

interface Trend {
  name: string
  description: string
  score: number
  direction: string
  category: string
}

interface NewsItem {
  title: string
  source: string
  summary: string
  category: string
  sentiment: string
  published_at: string
}

interface Conference {
  name: string
  date: string
  location: string
  description: string
  url: string
}

interface ReportData {
  weekRange: string
  generatedAt: string
  company: Company
  highlights: { tenders: number; competitors: number; leads: number; alerts: number }
  competitors: Competitor[]
  leads: Lead[]
  tenders: Tender[]
  trends: Trend[]
  news: NewsItem[]
  conferences: Conference[]
  recommendations: string[]
}

function getMomentumBadge(direction: string) {
  if (direction === 'עולה' || direction === 'up') {
    return <Badge className="bg-green-100 text-green-700 gap-1 shrink-0"><TrendingUp className="h-3 w-3" />עולה</Badge>
  }
  if (direction === 'יורד' || direction === 'down') {
    return <Badge className="bg-red-100 text-red-700 gap-1 shrink-0"><TrendingDown className="h-3 w-3" />יורד</Badge>
  }
  return <Badge className="bg-yellow-100 text-yellow-700 gap-1 shrink-0"><Minus className="h-3 w-3" />יציב</Badge>
}

function formatShortDate(dateStr: string) {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return dateStr }
}

function HighlightLine({ text }: { text?: string }) {
  if (!text) return null
  return (
    <p className="mb-3 text-sm italic text-muted-foreground border-r-2 border-primary/40 pr-3">
      {text}
    </p>
  )
}

export default function ReportsPage() {
  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [highlights, setHighlights] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const supabase = createClient()
  const { toast } = useToast()

  useEffect(() => {
    fetchReportData()
    loadHighlights()
  }, [])

  async function loadHighlights() {
    try {
      const res = await fetch('/api/weekly-report', { method: 'POST' })
      const data = await res.json()
      if (data.success) setHighlights(data.highlights || {})
    } catch { /* highlights are optional */ }
  }

  async function fetchReportData() {
    const today = new Date().toISOString().split('T')[0]

    const [
      { count: tendersCount },
      { count: competitorsCount },
      { count: leadsCount },
      { count: alertsCount },
      { data: comps },
      { data: leads },
      { data: tenders },
      { data: trends },
      { data: news },
      { data: conferences },
      { data: company },
    ] = await Promise.all([
      supabase.from("tenders").select("*", { count: "exact", head: true }),
      supabase.from("competitors").select("*", { count: "exact", head: true }),
      supabase.from("leads").select("*", { count: "exact", head: true }),
      supabase.from("alerts").select("*", { count: "exact", head: true }).eq("is_read", false),
      supabase.from("competitors").select("name, website, services, threat_score, positioning").order("threat_score", { ascending: false }),
      supabase.from("leads").select("name, website, industry, score, reason, source").order("score", { ascending: false }),
      supabase.from("tenders").select("title, organization, deadline, budget, description, relevance_score").order("relevance_score", { ascending: false }),
      supabase.from("trends").select("name, description, score, direction, category").order("created_at", { ascending: false }),
      supabase.from("news").select("title, source, summary, category, sentiment, published_at").order("published_at", { ascending: false }),
      supabase.from("conferences").select("name, date, location, description, url").gte("date", today).order("date", { ascending: true }),
      supabase.from("companies").select("name, industry, website, city, description").single(),
    ])

    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const weekRange = `${weekAgo.toLocaleDateString("he-IL", { day: "numeric", month: "long" })} - ${now.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" })}`
    const generatedAt = now.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })

    const recommendations: string[] = []
    if ((leadsCount || 0) > 0) recommendations.push("לפנות ללידים בעלי ציון גבוה מ-80 תוך 24 שעות")
    if ((competitorsCount || 0) > 0) recommendations.push("לעקוב אחר פעילות המתחרים ולהכין תגובה")
    if ((tendersCount || 0) > 0) recommendations.push("לבחון את המכרזים הפתוחים ולפעול בהתאם")
    recommendations.push("להמשיך לעדכן את פרופיל החברה לתוצאות מדויקות יותר")

    setReportData({
      weekRange,
      generatedAt,
      company: {
        name: company?.name || "החברה שלי",
        industry: company?.industry || "",
        website: company?.website || "",
        city: company?.city || "",
        description: company?.description || "",
      },
      highlights: {
        tenders: tendersCount || 0,
        competitors: competitorsCount || 0,
        leads: leadsCount || 0,
        alerts: alertsCount || 0,
      },
      competitors: comps || [],
      leads: leads || [],
      tenders: tenders || [],
      trends: trends || [],
      news: news || [],
      conferences: conferences || [],
      recommendations,
    })
    setLoading(false)
  }

  async function generatePDF() {
    if (!reportData) return
    setGenerating(true)
    try {
      const directionIcon = (d: string) => (d === 'עולה' || d === 'up') ? '↑' : (d === 'יורד' || d === 'down') ? '↓' : '→'
      const directionText = (d: string) => (d === 'עולה' || d === 'up') ? 'עולה' : (d === 'יורד' || d === 'down') ? 'יורד' : 'יציב'

      const highlightHtml = (text?: string) => text
        ? `<p style="font-style:italic;color:#6b7280;margin:0 0 12px;border-right:3px solid #3b82f6;padding-right:10px;">${text}</p>`
        : ''

      const printContent = `
        <!DOCTYPE html>
        <html dir="rtl" lang="he">
        <head>
          <meta charset="UTF-8">
          <title>דוח מודיעין שוק - ${reportData.company.name}</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 30px; direction: rtl; color: #1a1a1a; line-height: 1.5; }
            h1 { color: #1a1a1a; border-bottom: 3px solid #3b82f6; padding-bottom: 10px; margin-bottom: 5px; }
            h2 { color: #1e40af; margin-top: 30px; margin-bottom: 12px; border-right: 4px solid #3b82f6; padding-right: 10px; }
            .header { text-align: center; margin-bottom: 30px; }
            .meta { color: #6b7280; font-size: 13px; }
            .company-profile { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 16px; margin: 16px 0; }
            .company-profile p { margin: 4px 0; font-size: 14px; }
            .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 16px 0; }
            .stat { background: #f3f4f6; padding: 16px; border-radius: 8px; text-align: center; }
            .stat-value { font-size: 28px; font-weight: bold; color: #3b82f6; }
            .stat-label { color: #6b7280; font-size: 12px; }
            .item { padding: 12px 16px; border-radius: 8px; margin: 8px 0; border-right: 4px solid #3b82f6; background: #f9fafb; }
            .item-title { font-weight: bold; font-size: 14px; }
            .item-desc { color: #6b7280; font-size: 13px; margin-top: 4px; }
            .item-meta { color: #9ca3af; font-size: 12px; margin-top: 4px; }
            .badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; margin-right: 6px; }
            .badge-blue { background: #dbeafe; color: #1e40af; }
            .badge-red { background: #fee2e2; color: #991b1b; }
            .badge-green { background: #dcfce7; color: #166534; }
            .badge-yellow { background: #fef9c3; color: #92400e; }
            .badge-gray { background: #f3f4f6; color: #374151; }
            .recommendations li { background: #eff6ff; padding: 12px; border-radius: 8px; margin: 8px 0; display: flex; align-items: flex-start; gap: 10px; }
            .rec-num { background: #3b82f6; color: white; min-width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px; }
            @media print { body { padding: 15px; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>דוח מודיעין שוק</h1>
            <p class="meta">${reportData.weekRange}</p>
            <p class="meta">נוצר: ${reportData.generatedAt}</p>
          </div>

          <h2>פרופיל החברה</h2>
          <div class="company-profile">
            <p><strong>שם:</strong> ${reportData.company.name}</p>
            ${reportData.company.industry ? `<p><strong>תעשייה:</strong> ${reportData.company.industry}</p>` : ''}
            ${reportData.company.city ? `<p><strong>עיר:</strong> ${reportData.company.city}</p>` : ''}
            ${reportData.company.website ? `<p><strong>אתר:</strong> ${reportData.company.website}</p>` : ''}
            ${reportData.company.description ? `<p><strong>תיאור:</strong> ${reportData.company.description}</p>` : ''}
          </div>

          <h2>סיכום נתונים</h2>
          <div class="grid-4">
            <div class="stat"><div class="stat-value">${reportData.highlights.tenders}</div><div class="stat-label">מכרזים</div></div>
            <div class="stat"><div class="stat-value">${reportData.highlights.competitors}</div><div class="stat-label">מתחרים</div></div>
            <div class="stat"><div class="stat-value">${reportData.highlights.leads}</div><div class="stat-label">לידים</div></div>
            <div class="stat"><div class="stat-value">${reportData.highlights.alerts}</div><div class="stat-label">התראות</div></div>
          </div>

          ${reportData.competitors.length > 0 ? `
            <h2>מתחרים (${reportData.competitors.length})</h2>
            ${highlightHtml(highlights.competitors)}
            ${reportData.competitors.map(c => `
              <div class="item">
                <div class="item-title">${c.name} <span class="badge badge-red">איום: ${c.threat_score}</span>${c.positioning ? `<span class="badge badge-gray">${c.positioning}</span>` : ''}</div>
                ${c.services ? `<div class="item-desc">${c.services}</div>` : ''}
                ${c.website ? `<div class="item-meta">${c.website}</div>` : ''}
              </div>
            `).join('')}
          ` : ''}

          ${reportData.trends.length > 0 ? `
            <h2>טרנדים מובילים (${reportData.trends.length})</h2>
            ${highlightHtml(highlights.trends)}
            ${reportData.trends.map(t => `
              <div class="item">
                <div class="item-title">${directionIcon(t.direction)} ${t.name} <span class="badge ${(t.direction === 'עולה' || t.direction === 'up') ? 'badge-green' : (t.direction === 'יורד' || t.direction === 'down') ? 'badge-red' : 'badge-yellow'}">${directionText(t.direction)}</span>${t.category ? `<span class="badge badge-gray">${t.category}</span>` : ''}</div>
                ${t.description ? `<div class="item-desc">${t.description}</div>` : ''}
              </div>
            `).join('')}
          ` : ''}

          ${reportData.news.length > 0 ? `
            <h2>חדשות אחרונות (${reportData.news.length})</h2>
            ${highlightHtml(highlights.news)}
            ${reportData.news.map(n => `
              <div class="item">
                <div class="item-title">${n.title} ${n.sentiment === 'positive' ? '<span class="badge badge-green">חיובי</span>' : n.sentiment === 'negative' ? '<span class="badge badge-red">שלילי</span>' : '<span class="badge badge-gray">ניטרלי</span>'}</div>
                ${n.summary ? `<div class="item-desc">${n.summary}</div>` : ''}
                <div class="item-meta">${n.source || ''}${n.published_at ? ` | ${formatShortDate(n.published_at)}` : ''}</div>
              </div>
            `).join('')}
          ` : ''}

          ${reportData.conferences.length > 0 ? `
            <h2>כנסים קרובים (${reportData.conferences.length})</h2>
            ${highlightHtml(highlights.conferences)}
            ${reportData.conferences.map(c => `
              <div class="item">
                <div class="item-title">${c.name}</div>
                <div class="item-desc">${c.date ? `תאריך: ${c.date}` : ''}${c.location ? ` | ${c.location}` : ''}</div>
                ${c.description ? `<div class="item-meta">${c.description}</div>` : ''}
              </div>
            `).join('')}
          ` : ''}

          ${reportData.tenders.length > 0 ? `
            <h2>מכרזים פתוחים (${reportData.tenders.length})</h2>
            ${highlightHtml(highlights.tenders)}
            ${reportData.tenders.map(t => `
              <div class="item">
                <div class="item-title">${t.title}${t.relevance_score ? `<span class="badge badge-blue">רלוונטיות: ${t.relevance_score}</span>` : ''}</div>
                <div class="item-desc">${t.organization || ''}${t.deadline ? ` | דדליין: ${t.deadline}` : ''}${t.budget ? ` | תקציב: ${t.budget}` : ''}</div>
                ${t.description ? `<div class="item-meta">${t.description}</div>` : ''}
              </div>
            `).join('')}
          ` : ''}

          ${reportData.leads.length > 0 ? `
            <h2>לידים (${reportData.leads.length})</h2>
            ${reportData.leads.map(l => `
              <div class="item">
                <div class="item-title">${l.name} <span class="badge ${l.score >= 80 ? 'badge-green' : 'badge-yellow'}">ציון: ${l.score}</span>${l.industry ? `<span class="badge badge-gray">${l.industry}</span>` : ''}</div>
                ${l.reason ? `<div class="item-desc">${l.reason}</div>` : ''}
                ${l.website ? `<div class="item-meta">${l.website}</div>` : ''}
              </div>
            `).join('')}
          ` : ''}

          <h2>המלצות</h2>
          <ul class="recommendations" style="list-style:none; padding:0;">
            ${reportData.recommendations.map((rec, idx) => `
              <li><span class="rec-num">${idx + 1}</span> <span>${rec}</span></li>
            `).join('')}
          </ul>
        </body>
        </html>
      `

      const printWindow = window.open('', '_blank')
      if (printWindow) {
        printWindow.document.write(printContent)
        printWindow.document.close()
        printWindow.focus()
        setTimeout(() => { printWindow.print() }, 300)
      }

      toast({ title: "הדוח מוכן", description: "חלון ההדפסה נפתח — בחר 'שמור כ-PDF' להורדה" })
    } catch (error) {
      console.error("Error generating PDF:", error)
      toast({ title: "שגיאה", description: "אירעה שגיאה בעת יצירת הדוח", variant: "destructive" })
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
          <p className="text-muted-foreground">דוח מודיעין שוק מקיף</p>
        </div>
        <Button onClick={generatePDF} disabled={generating}>
          {generating ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Download className="ml-2 h-4 w-4" />}
          הורד PDF מלא
        </Button>
      </div>

      {/* Report Card */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-xl">דוח מודיעין שוק</CardTitle>
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
          {/* KPI highlights */}
          <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="rounded-lg bg-primary/10 p-4 text-center">
              <FileText className="mx-auto mb-2 h-6 w-6 text-primary" />
              <p className="text-2xl font-bold">{reportData.highlights.tenders}</p>
              <p className="text-sm text-muted-foreground">מכרזים</p>
            </div>
            <div className="rounded-lg bg-red-100 p-4 text-center">
              <Target className="mx-auto mb-2 h-6 w-6 text-red-600" />
              <p className="text-2xl font-bold">{reportData.highlights.competitors}</p>
              <p className="text-sm text-muted-foreground">מתחרים</p>
            </div>
            <div className="rounded-lg bg-blue-100 p-4 text-center">
              <Users className="mx-auto mb-2 h-6 w-6 text-blue-600" />
              <p className="text-2xl font-bold">{reportData.highlights.leads}</p>
              <p className="text-sm text-muted-foreground">לידים</p>
            </div>
            <div className="rounded-lg bg-yellow-100 p-4 text-center">
              <TrendingUp className="mx-auto mb-2 h-6 w-6 text-yellow-600" />
              <p className="text-2xl font-bold">{reportData.highlights.alerts}</p>
              <p className="text-sm text-muted-foreground">התראות</p>
            </div>
          </div>

          {/* מתחרים עיקריים */}
          {reportData.competitors.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-1 text-base font-semibold">מתחרים עיקריים</h3>
              <HighlightLine text={highlights.competitors} />
              <div className="space-y-2">
                {reportData.competitors.slice(0, 3).map((c, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
                    <div>
                      <p className="font-medium text-sm">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.services}</p>
                    </div>
                    <Badge className={c.threat_score >= 70 ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}>
                      איום: {c.threat_score}
                    </Badge>
                  </div>
                ))}
                {reportData.competitors.length > 3 && (
                  <p className="text-xs text-muted-foreground text-center">+ {reportData.competitors.length - 3} נוספים בדוח המלא</p>
                )}
              </div>
            </div>
          )}

          {/* טרנדים מובילים */}
          {reportData.trends.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-1 text-base font-semibold">טרנדים מובילים</h3>
              <HighlightLine text={highlights.trends} />
              <div className="space-y-2">
                {reportData.trends.slice(0, 3).map((t, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{t.name}</p>
                      {t.category && <p className="text-xs text-muted-foreground">{t.category}</p>}
                    </div>
                    {getMomentumBadge(t.direction)}
                  </div>
                ))}
                {reportData.trends.length > 3 && (
                  <p className="text-xs text-muted-foreground text-center">+ {reportData.trends.length - 3} נוספים בדוח המלא</p>
                )}
              </div>
            </div>
          )}

          {/* חדשות אחרונות */}
          {reportData.news.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-1 text-base font-semibold">חדשות אחרונות</h3>
              <HighlightLine text={highlights.news} />
              <div className="space-y-2">
                {reportData.news.slice(0, 3).map((n, i) => (
                  <div key={i} className="rounded-lg border bg-muted/30 p-3">
                    <p className="font-medium text-sm">{n.title}</p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      {n.source && <span>{n.source}</span>}
                      {n.published_at && <span>·  {formatShortDate(n.published_at)}</span>}
                    </div>
                  </div>
                ))}
                {reportData.news.length > 3 && (
                  <p className="text-xs text-muted-foreground text-center">+ {reportData.news.length - 3} נוספות בדוח המלא</p>
                )}
              </div>
            </div>
          )}

          {/* כנסים קרובים */}
          <div className="mb-6">
            <h3 className="mb-1 text-base font-semibold">כנסים קרובים</h3>
            <HighlightLine text={highlights.conferences} />
            {reportData.conferences.length > 0 ? (
              <div className="space-y-2">
                {reportData.conferences.slice(0, 3).map((c, i) => (
                  <div key={i} className="rounded-lg border bg-muted/30 p-3">
                    <p className="font-medium text-sm">{c.name}</p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      {c.date && <span>{formatShortDate(c.date)}</span>}
                      {c.location && <span>· {c.location}</span>}
                    </div>
                  </div>
                ))}
                {reportData.conferences.length > 3 && (
                  <p className="text-xs text-muted-foreground text-center">+ {reportData.conferences.length - 3} נוספים בדוח המלא</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground rounded-lg border bg-muted/30 p-3">לא נמצאו כנסים קרובים</p>
            )}
          </div>

          {/* מכרזים פתוחים */}
          <div className="mb-6">
            <h3 className="mb-1 text-base font-semibold">מכרזים פתוחים</h3>
            <HighlightLine text={highlights.tenders} />
            {reportData.tenders.length > 0 ? (
              <div className="space-y-2">
                {reportData.tenders.slice(0, 3).map((t, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{t.title}</p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        {t.organization && <span>{t.organization}</span>}
                        {t.deadline && <span>· {t.deadline}</span>}
                      </div>
                    </div>
                    {t.relevance_score > 0 && (
                      <Badge variant="secondary" className="shrink-0">{t.relevance_score}%</Badge>
                    )}
                  </div>
                ))}
                {reportData.tenders.length > 3 && (
                  <p className="text-xs text-muted-foreground text-center">+ {reportData.tenders.length - 3} נוספים בדוח המלא</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground rounded-lg border bg-muted/30 p-3">לא נמצאו מכרזים רלוונטיים</p>
            )}
          </div>

          {/* לידים מובילים */}
          {reportData.leads.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-3 text-base font-semibold">לידים מובילים</h3>
              <div className="space-y-2">
                {reportData.leads.slice(0, 3).map((l, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
                    <div>
                      <p className="font-medium text-sm">{l.name}</p>
                      <p className="text-xs text-muted-foreground">{l.industry}</p>
                    </div>
                    <Badge variant="secondary">{l.score}/100</Badge>
                  </div>
                ))}
                {reportData.leads.length > 3 && (
                  <p className="text-xs text-muted-foreground text-center">+ {reportData.leads.length - 3} נוספים בדוח המלא</p>
                )}
              </div>
            </div>
          )}

          {/* המלצות */}
          <div>
            <h3 className="mb-3 text-base font-semibold">המלצות</h3>
            <ul className="space-y-2">
              {reportData.recommendations.map((rec, index) => (
                <li key={index} className="flex items-start gap-3 rounded-lg border bg-primary/5 p-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {index + 1}
                  </span>
                  <span className="text-sm">{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
