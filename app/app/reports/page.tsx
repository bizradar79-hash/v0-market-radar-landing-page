"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Download, RefreshCw, TrendingUp, TrendingDown, Minus, Users, Search, Globe,
  Zap, FileText, Calendar, Target, AlertTriangle, CheckCircle,
  Star, Newspaper, ChevronRight, Loader2, BarChart3, Mail, Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"

// ── Types ──────────────────────────────────────────────────────────────────

interface SeoPosition { query: string; position: number; appeared: boolean }
interface CompetitorThreat { name: string; threat_score: number; threat: string }
interface NewsItem { title: string; summary: string }
interface TenderItem { title: string; deadline: string; organization: string }
interface ConferenceItem { name: string; date: string }
interface KeywordIntelRow {
  keyword: string
  searchVolume: number
  direction?: string
  directionHe?: string
  changePct?: number
  competition?: string
  competitionHe?: string
  cpc?: number
  insight?: string
}
interface KeywordOpportunityRow {
  keyword: string
  searchVolume: number
  direction?: string
  directionHe?: string
  changePct?: number
  opportunityLevel?: "hot" | "good" | null
  seedKeyword?: string
}

interface WeeklyReport {
  executive_summary: string
  seo_geo: {
    summary: string
    top_positions: SeoPosition[]
    opportunities: string[]
  }
  competitors: {
    summary: string
    threats: CompetitorThreat[]
    opportunities: string[]
  }
  trends: {
    hot_keywords: string[]
    competitor_moves: string[]
    market_insights: string[]
    keyword_intel?: KeywordIntelRow[]
    keyword_opportunities?: KeywordOpportunityRow[]
  }
  opportunities: {
    new_niches: string[]
    distribution_channels: string[]
    actions: string[]
  }
  news_tenders: {
    relevant_news: NewsItem[]
    active_tenders: TenderItem[]
    upcoming_conferences: ConferenceItem[]
  }
  weekly_actions: {
    immediate: string[]
    short_term: string[]
  }
  generated_at: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("he-IL", {
      year: "numeric", month: "long", day: "numeric",
    })
  } catch { return iso }
}

function threatColor(score: number) {
  if (score >= 80) return "bg-red-100 text-red-800 border-red-200"
  if (score >= 60) return "bg-orange-100 text-orange-800 border-orange-200"
  return "bg-yellow-100 text-yellow-800 border-yellow-200"
}

function positionBadgeColor(pos: number) {
  if (pos <= 3) return "bg-emerald-500 text-white"
  if (pos <= 6) return "bg-amber-500 text-white"
  return "bg-gray-400 text-white"
}

// ── Sub-components ─────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, color }: { icon: any; title: string; color: string }) {
  return (
    <div className={`flex items-center gap-2 mb-4 pb-3 border-b-2 ${color}`}>
      <Icon className="w-5 h-5" />
      <h2 className="text-lg font-bold">{title}</h2>
    </div>
  )
}

function BulletList({ items }: { items: string[] }) {
  if (!items?.length) return null
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
          <ChevronRight className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function KeywordIntelCard({ k }: { k: KeywordIntelRow }) {
  const dir = k.direction
  const DirIcon = dir === "rising" ? TrendingUp : dir === "falling" ? TrendingDown : Minus
  const dirColor = dir === "rising" ? "text-emerald-600" : dir === "falling" ? "text-red-500" : "text-gray-400"
  const dirHe = k.directionHe || (dir === "rising" ? "עולה" : dir === "falling" ? "יורד" : "יציב")
  const pct = typeof k.changePct === "number" ? k.changePct : 0
  const vol = typeof k.searchVolume === "number" ? k.searchVolume : 0
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/60 px-4 py-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <DirIcon className={`w-4 h-4 shrink-0 ${dirColor}`} />
          <span className="font-semibold text-sm text-gray-900 truncate">{k.keyword}</span>
          {dir === "rising" && <span className="text-xs">🔥</span>}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="font-bold text-gray-800">{vol.toLocaleString("he-IL")}</span>
          <span className="text-gray-400">חיפושים/חו׳</span>
          <Badge className={`border-0 text-white ${pct > 0 ? "bg-emerald-500" : pct < 0 ? "bg-red-500" : "bg-gray-400"}`}>
            {pct > 0 ? "+" : ""}{pct}%
          </Badge>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500 flex-wrap">
        <span>מגמה: {dirHe}</span>
        {k.competitionHe && k.competitionHe !== "—" && <span>· תחרות פרסומית: {k.competitionHe}</span>}
        {typeof k.cpc === "number" && k.cpc > 0 && <span>· CPC ${k.cpc}</span>}
      </div>
      {k.insight && <p className="text-xs text-gray-600 mt-1.5 leading-snug">{k.insight}</p>}
    </div>
  )
}

function ActionCard({ text, variant }: { text: string; variant: "immediate" | "short_term" }) {
  const styles = variant === "immediate"
    ? "bg-red-50 border-red-200 text-red-900"
    : "bg-blue-50 border-blue-200 text-blue-900"
  return (
    <div className={`border rounded-lg px-4 py-3 text-sm font-medium ${styles}`}>
      {text}
    </div>
  )
}

// ── Loading skeleton ───────────────────────────────────────────────────────

function LoadingSkeleton({ companyName }: { companyName: string }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-6 p-8" dir="rtl">
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">מייצר דוח שבועי</h2>
        <p className="text-gray-500 text-sm mb-4">
          {companyName ? `עבור ${companyName}` : "אוסף נתונים ומנתח..."}
        </p>
        <div className="space-y-2">
          {["מנתח נתוני SEO/GEO", "בודק מתחרים", "מעריך טרנדים", "מסכם הזדמנויות"].map((step) => (
            <div key={step} className="flex items-center gap-2 text-xs text-gray-400 justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-300 animate-pulse" />
              {step}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [report, setReport] = useState<WeeklyReport | null>(null)
  const [companyName, setCompanyName] = useState("")
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  const handleSendEmail = async () => {
    setSendingEmail(true)
    try {
      const res = await fetch("/api/weekly-report/send-email", { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "שגיאה בשליחת המייל")
      toast({ title: "הדוח נשלח בהצלחה", description: `נשלח ל-${data.sentTo}` })
    } catch (e: any) {
      toast({ title: "שגיאה בשליחת דוח", description: e.message, variant: "destructive" })
    } finally {
      setSendingEmail(false)
    }
  }

  // On mount: DISPLAY the saved report only — never auto-generate.
  const loadCached = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/generate-weekly-report?cachedOnly=true", { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "שגיאה בטעינת הדוח")
      setReport(data.report || null)
      setCompanyName(data.company_name || "")
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Explicit, user-triggered generation (button) — also used by scans/admin elsewhere.
  const generateReport = useCallback(async () => {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch("/api/generate-weekly-report?force=true", { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "שגיאה ביצירת הדוח")
      setReport(data.report)
      setCompanyName(data.company_name || "")
      toast({ title: "הדוח עודכן", description: "נוצר דוח חדש עם הנתונים העדכניים" })
    } catch (e: any) {
      setError(e.message)
      toast({ title: "שגיאה ביצירת דוח", description: e.message, variant: "destructive" })
    } finally {
      setGenerating(false)
    }
  }, [toast])

  useEffect(() => { loadCached() }, [loadCached])

  // Initial cached read — light spinner, NOT the "מייצר דוח" generation skeleton.
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8" dir="rtl">
        <div className="flex flex-col items-center gap-3 text-gray-500">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <p className="text-sm">טוען דוח...</p>
        </div>
      </div>
    )
  }

  // Active generation (only via button) — show the generation skeleton.
  if (generating && !report) return <LoadingSkeleton companyName={companyName} />

  // No saved report yet — empty state + explicit generate button (no auto-fire).
  if (!report) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8" dir="rtl">
        <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">עדיין אין דוח שבועי</h2>
          <p className="text-gray-500 text-sm mb-6">
            הדוח נוצר אוטומטית בכל סריקה שבועית. אפשר גם ליצור דוח מעודכן עכשיו לפי הנתונים האחרונים.
          </p>
          {error && <p className="text-red-500 text-xs mb-4">{error}</p>}
          <Button onClick={generateReport} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {generating ? "מייצר דוח..." : "צור דוח עכשיו"}
          </Button>
        </div>
      </div>
    )
  }

  if (error && !report) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8" dir="rtl">
        <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">לא ניתן ליצור דוח</h2>
          <p className="text-gray-500 text-sm mb-6">{error}</p>
          <Button onClick={generateReport} disabled={generating}>נסה שוב</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100" dir="rtl">
      {/* Print-specific styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          .report-section { break-inside: avoid; }
          @page { size: A4; margin: 1cm; }
        }
      `}</style>

      {/* ── Screen action bar ────────────────────────────────────────────── */}
      <div className="no-print sticky top-0 z-10 bg-slate-900 text-white px-6 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-blue-300" />
          <span className="font-semibold">דוח שבועי — {companyName}</span>
          {report.generated_at && (
            <span className="text-slate-400 text-sm hidden sm:inline">
              | {formatDate(report.generated_at)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="text-slate-300 hover:text-white hover:bg-slate-700"
            onClick={generateReport}
            disabled={generating}
          >
            {generating ? (
              <Loader2 className="w-4 h-4 ml-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 ml-2" />
            )}
            {generating ? "מייצר..." : "צור דוח מעודכן"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-slate-300 hover:text-white hover:bg-slate-700"
            onClick={handleSendEmail}
            disabled={sendingEmail}
          >
            {sendingEmail ? (
              <Loader2 className="w-4 h-4 ml-2 animate-spin" />
            ) : (
              <Mail className="w-4 h-4 ml-2" />
            )}
            {sendingEmail ? "שולח..." : "שלח למייל"}
          </Button>
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-500 text-white gap-2"
            onClick={() => window.print()}
          >
            <Download className="w-4 h-4" />
            הורד PDF
          </Button>
        </div>
      </div>

      {/* ── Report container ─────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5 pb-12">

        {/* Print header (hidden on screen) */}
        <div className="hidden print:block border-b-4 border-slate-900 pb-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{companyName}</h1>
              <p className="text-slate-500 text-sm mt-1">דוח שבועי | {formatDate(report.generated_at)}</p>
            </div>
            <div className="text-left">
              <p className="text-xs text-slate-400">North Star Radar</p>
            </div>
          </div>
        </div>

        {/* ── Executive Summary ──────────────────────────────────────────── */}
        <div className="report-section bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-6 shadow-xl">
          <div className="flex items-center gap-2 mb-3">
            <Star className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-bold text-amber-400 uppercase tracking-wide">תמצית מנהלים</h2>
          </div>
          <p className="text-slate-100 leading-relaxed text-sm sm:text-base">
            {report.executive_summary}
          </p>
        </div>

        {/* ── SEO / GEO ─────────────────────────────────────────────────── */}
        <div className="report-section bg-white rounded-2xl p-6 shadow-sm border border-blue-100">
          <SectionHeader icon={Search} title="דירוג SEO וGEO" color="border-blue-400 text-blue-700" />

          <p className="text-sm text-gray-600 mb-4">{report.seo_geo?.summary}</p>

          {(report.seo_geo?.top_positions?.length ?? 0) > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">מיקומים בגוגל</p>
              <div className="flex flex-wrap gap-2">
                {report.seo_geo.top_positions.map((p, i) => (
                  <div key={i} className={`rounded-lg px-3 py-1.5 flex items-center gap-2 text-xs border ${p.appeared ? "bg-white border-gray-200" : "bg-gray-50 border-gray-100 opacity-60"}`}>
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${p.appeared ? positionBadgeColor(p.position) : "bg-gray-300 text-white"}`}>
                      {p.appeared ? `#${p.position}` : "—"}
                    </span>
                    <span className="text-gray-700 max-w-[160px] truncate">{p.query}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(report.seo_geo?.opportunities?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-semibold text-blue-600 uppercase mb-2">הזדמנויות</p>
              <BulletList items={report.seo_geo.opportunities} />
            </div>
          )}
        </div>

        {/* ── Competitors ───────────────────────────────────────────────── */}
        <div className="report-section bg-white rounded-2xl p-6 shadow-sm border border-orange-100">
          <SectionHeader icon={Users} title="מתחרים" color="border-orange-400 text-orange-700" />

          <p className="text-sm text-gray-600 mb-4">{report.competitors?.summary}</p>

          {(report.competitors?.threats?.length ?? 0) > 0 && (
            <div className="space-y-2 mb-4">
              {report.competitors.threats.map((t, i) => (
                <div key={i} className={`rounded-lg border px-4 py-2.5 flex items-start gap-3 ${threatColor(t.threat_score)}`}>
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{t.name}</span>
                      <Badge className={`text-xs ${t.threat_score >= 80 ? "bg-red-600" : t.threat_score >= 60 ? "bg-orange-500" : "bg-yellow-500"} text-white border-0`}>
                        {t.threat_score}
                      </Badge>
                    </div>
                    {t.threat && <p className="text-xs mt-1 opacity-80">{t.threat}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {(report.competitors?.opportunities?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-semibold text-orange-600 uppercase mb-2">הזדמנויות מול המתחרים</p>
              <BulletList items={report.competitors.opportunities} />
            </div>
          )}
        </div>

        {/* ── Keywords & Trends ─────────────────────────────────────────── */}
        <div className="report-section bg-white rounded-2xl p-6 shadow-sm border border-emerald-100">
          <SectionHeader icon={TrendingUp} title="מילות מפתח ומגמות" color="border-emerald-400 text-emerald-700" />

          {/* REAL keyword intelligence (DataForSEO) — client's actual keywords + numbers */}
          {(report.trends?.keyword_intel?.length ?? 0) > 0 ? (
            <div className="mb-5">
              <p className="text-xs font-semibold text-emerald-600 uppercase mb-2">מילות המפתח שלך</p>
              <div className="space-y-2">
                {report.trends!.keyword_intel!.map((k, i) => <KeywordIntelCard key={i} k={k} />)}
              </div>

              {(report.trends?.keyword_opportunities?.length ?? 0) > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-amber-600 uppercase mb-2">הזדמנויות long-tail</p>
                  <div className="flex flex-wrap gap-2">
                    {report.trends!.keyword_opportunities!.map((o, i) => (
                      <span key={i} className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-200 text-xs rounded-lg px-2.5 py-1.5 font-medium">
                        {o.opportunityLevel === "hot" ? "🔥" : "💎"} {o.keyword}
                        <span className="text-amber-600">· {(o.searchVolume || 0).toLocaleString("he-IL")}/חו׳ · {o.directionHe || "—"}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (report.trends?.hot_keywords?.length ?? 0) > 0 ? (
            // Fallback only when no real keyword_intel exists.
            <div className="mb-5">
              <p className="text-xs font-semibold text-emerald-600 uppercase mb-2">מילות מפתח חמות</p>
              <div className="flex flex-wrap gap-1.5">
                {report.trends.hot_keywords.map((kw, i) => (
                  <span key={i} className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs rounded-full px-2.5 py-1 font-medium">
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(report.trends?.competitor_moves?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-semibold text-blue-600 uppercase mb-2">מהלכי מתחרים</p>
                <BulletList items={report.trends.competitor_moves} />
              </div>
            )}

            {(report.trends?.market_insights?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-semibold text-purple-600 uppercase mb-2">תובנות שוק</p>
                <BulletList items={report.trends.market_insights} />
              </div>
            )}
          </div>
        </div>

        {/* ── Opportunities ─────────────────────────────────────────────── */}
        <div className="report-section bg-white rounded-2xl p-6 shadow-sm border border-purple-100">
          <SectionHeader icon={Target} title="הזדמנויות עסקיות" color="border-purple-400 text-purple-700" />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {(report.opportunities?.new_niches?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-semibold text-purple-600 uppercase mb-2">נישות חדשות</p>
                <BulletList items={report.opportunities.new_niches} />
              </div>
            )}
            {(report.opportunities?.distribution_channels?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-semibold text-indigo-600 uppercase mb-2">ערוצי הפצה</p>
                <BulletList items={report.opportunities.distribution_channels} />
              </div>
            )}
            {(report.opportunities?.actions?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-semibold text-teal-600 uppercase mb-2">פעולות מומלצות</p>
                <BulletList items={report.opportunities.actions} />
              </div>
            )}
          </div>
        </div>

        {/* ── News & Tenders ────────────────────────────────────────────── */}
        <div className="report-section bg-white rounded-2xl p-6 shadow-sm border border-teal-100">
          <SectionHeader icon={Newspaper} title="חדשות, מכרזים וכנסים" color="border-teal-400 text-teal-700" />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {/* News */}
            {(report.news_tenders?.relevant_news?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-semibold text-teal-600 uppercase mb-2">חדשות רלוונטיות</p>
                <div className="space-y-2">
                  {report.news_tenders.relevant_news.map((n, i) => (
                    <div key={i} className="bg-teal-50 rounded-lg px-3 py-2">
                      <p className="text-sm font-medium text-teal-900 leading-snug">{n.title}</p>
                      {n.summary && <p className="text-xs text-teal-700 mt-0.5 opacity-80">{n.summary}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tenders */}
            {(report.news_tenders?.active_tenders?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-semibold text-amber-600 uppercase mb-2">מכרזים פעילים</p>
                <div className="space-y-2">
                  {report.news_tenders.active_tenders.map((t, i) => (
                    <div key={i} className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                      <p className="text-sm font-medium text-amber-900 leading-snug">{t.title}</p>
                      <p className="text-xs text-amber-700 mt-0.5">{t.organization}</p>
                      {t.deadline && (
                        <div className="flex items-center gap-1 mt-1">
                          <Calendar className="w-3 h-3 text-amber-500" />
                          <span className="text-xs text-amber-600">עד {t.deadline}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Conferences */}
            {(report.news_tenders?.upcoming_conferences?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-semibold text-blue-600 uppercase mb-2">כנסים קרובים</p>
                <div className="space-y-2">
                  {report.news_tenders.upcoming_conferences.map((c, i) => (
                    <div key={i} className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                      <p className="text-sm font-medium text-blue-900 leading-snug">{c.name}</p>
                      {c.date && (
                        <div className="flex items-center gap-1 mt-1">
                          <Calendar className="w-3 h-3 text-blue-500" />
                          <span className="text-xs text-blue-600">{c.date}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Weekly Actions ────────────────────────────────────────────── */}
        <div className="report-section bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
          <SectionHeader icon={Zap} title="משימות שבועיות" color="border-slate-400 text-slate-700" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(report.weekly_actions?.immediate?.length ?? 0) > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <p className="text-xs font-bold text-red-700 uppercase">מיידי — עכשיו</p>
                </div>
                <div className="space-y-2">
                  {report.weekly_actions.immediate.map((a, i) => (
                    <ActionCard key={i} text={a} variant="immediate" />
                  ))}
                </div>
              </div>
            )}

            {(report.weekly_actions?.short_term?.length ?? 0) > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <p className="text-xs font-bold text-blue-700 uppercase">קצר טווח — השבוע</p>
                </div>
                <div className="space-y-2">
                  {report.weekly_actions.short_term.map((a, i) => (
                    <ActionCard key={i} text={a} variant="short_term" />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-gray-400 py-2 no-print">
          דוח נוצר ב-{formatDate(report.generated_at)} · מתחדש אוטומטית כל שבוע
        </div>
        <div className="hidden print:block text-center text-xs text-gray-400 pt-4 border-t border-gray-200 mt-4">
          דוח נוצר ב-{formatDate(report.generated_at)} · North Star Radar
        </div>
      </div>
    </div>
  )
}
