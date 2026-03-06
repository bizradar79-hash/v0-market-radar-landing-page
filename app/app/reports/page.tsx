"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Download, Calendar, FileText, TrendingUp, Users, Target, Lightbulb } from "lucide-react"

const reportData = {
  weekRange: "26 פברואר - 4 מרץ 2026",
  generatedAt: "4 במרץ 2026, 08:00",
  highlights: {
    opportunities: 12,
    competitors: 3,
    leads: 8,
    alerts: 5,
  },
  topOpportunities: [
    {
      title: "הזדמנות חדשה בשוק הפינטק",
      score: 85,
      description: "זוהתה עלייה משמעותית בביקוש לפתרונות תשלום דיגיטליים",
    },
    {
      title: "שותפות אסטרטגית פוטנציאלית",
      score: 78,
      description: "חברת טכנולוגיה מובילה מחפשת שותפים בתחום ה-AI",
    },
    {
      title: "מגזר הבריאות הדיגיטלית",
      score: 72,
      description: "גידול בהשקעות בסטארטאפים בתחום הבריאות",
    },
  ],
  competitorActivity: [
    { name: "TechVision Ltd", activity: "השקת מוצר חדש", impact: "גבוה" },
    { name: "DataPro Solutions", activity: "שינוי מחירים", impact: "בינוני" },
    { name: "MarketSense AI", activity: "גיוס הון", impact: "בינוני" },
  ],
  newLeads: [
    { company: "סטארטאפ טק בע\"מ", score: 85, source: "אתר" },
    { company: "חדשנות ישראל", score: 90, source: "המלצה" },
    { company: "פתרונות דיגיטל", score: 72, source: "לינקדאין" },
  ],
  recommendations: [
    "לפנות ללידים בעלי ציון גבוה מ-80 תוך 24 שעות",
    "לעקוב אחר השקת המוצר של TechVision ולהכין תגובה",
    "להגיש הצעה למכרז משרד הבריאות לפני הדדליין",
    "לחקור את שוק הפינטק לזיהוי הזדמנויות נוספות",
  ],
}

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">דוחות</h1>
          <p className="text-muted-foreground">דוח מודיעין שבועי</p>
        </div>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Download className="ml-2 h-4 w-4" />
          הורד PDF
        </Button>
      </div>

      {/* Report Card */}
      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-xl text-foreground">
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
              <p className="text-2xl font-bold text-foreground">{reportData.highlights.opportunities}</p>
              <p className="text-sm text-muted-foreground">הזדמנויות חדשות</p>
            </div>
            <div className="rounded-lg bg-red-500/10 p-4 text-center">
              <Target className="mx-auto mb-2 h-6 w-6 text-red-500" />
              <p className="text-2xl font-bold text-foreground">{reportData.highlights.competitors}</p>
              <p className="text-sm text-muted-foreground">פעילות מתחרים</p>
            </div>
            <div className="rounded-lg bg-blue-500/10 p-4 text-center">
              <Users className="mx-auto mb-2 h-6 w-6 text-blue-500" />
              <p className="text-2xl font-bold text-foreground">{reportData.highlights.leads}</p>
              <p className="text-sm text-muted-foreground">לידים חדשים</p>
            </div>
            <div className="rounded-lg bg-yellow-500/10 p-4 text-center">
              <TrendingUp className="mx-auto mb-2 h-6 w-6 text-yellow-500" />
              <p className="text-2xl font-bold text-foreground">{reportData.highlights.alerts}</p>
              <p className="text-sm text-muted-foreground">התראות</p>
            </div>
          </div>

          {/* Top Opportunities */}
          <div className="mb-8">
            <h3 className="mb-4 text-lg font-semibold text-foreground">הזדמנויות מובילות</h3>
            <div className="space-y-3">
              {reportData.topOpportunities.map((opp, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-4"
                >
                  <div>
                    <p className="font-medium text-foreground">{opp.title}</p>
                    <p className="text-sm text-muted-foreground">{opp.description}</p>
                  </div>
                  <Badge className="bg-primary/10 text-primary">
                    {opp.score}/100
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          {/* Competitor Activity */}
          <div className="mb-8">
            <h3 className="mb-4 text-lg font-semibold text-foreground">פעילות מתחרים</h3>
            <div className="space-y-3">
              {reportData.competitorActivity.map((comp, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-4"
                >
                  <div>
                    <p className="font-medium text-foreground">{comp.name}</p>
                    <p className="text-sm text-muted-foreground">{comp.activity}</p>
                  </div>
                  <Badge
                    className={
                      comp.impact === "גבוה"
                        ? "bg-red-500/10 text-red-500"
                        : "bg-yellow-500/10 text-yellow-500"
                    }
                  >
                    {comp.impact}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          {/* New Leads */}
          <div className="mb-8">
            <h3 className="mb-4 text-lg font-semibold text-foreground">לידים חדשים</h3>
            <div className="space-y-3">
              {reportData.newLeads.map((lead, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-4"
                >
                  <div>
                    <p className="font-medium text-foreground">{lead.company}</p>
                    <p className="text-sm text-muted-foreground">מקור: {lead.source}</p>
                  </div>
                  <Badge
                    className={
                      lead.score >= 80
                        ? "bg-green-500/10 text-green-500"
                        : "bg-yellow-500/10 text-yellow-500"
                    }
                  >
                    ציון: {lead.score}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          {/* Recommendations */}
          <div>
            <h3 className="mb-4 text-lg font-semibold text-foreground">המלצות</h3>
            <ul className="space-y-2">
              {reportData.recommendations.map((rec, index) => (
                <li
                  key={index}
                  className="flex items-start gap-3 rounded-lg border border-border bg-primary/5 p-4"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {index + 1}
                  </span>
                  <span className="text-foreground">{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
