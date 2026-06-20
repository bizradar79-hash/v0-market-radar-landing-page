"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Building2,
  Loader2,
  Star,
  Plus,
  TrendingUp,
  TrendingDown,
  Minus,
  MapPin,
  Search,
  ShieldCheck,
  Target,
  Tag,
  Users,
  Key,
  Trophy,
  ChevronDown,
  ChevronUp,
  Truck,
  MessageSquare,
  ExternalLink,
  Settings,
  ArrowLeft,
} from "lucide-react"
import type { BusinessProfile } from "@/types/business-profile"

// ── Types ──────────────────────────────────────────────────────────────────

interface SwotData {
  strengths: string[]
  weaknesses: string[]
  opportunities: string[]
  threats: string[]
}

interface ReviewAnalysis {
  google_rating?: number | null
  google_review_count?: number | null
  google_maps_url?: string | null
  not_found?: boolean
  google_search_url?: string | null
  fetchedAt?: string
  sentiment_score?: number | null
  summary?: string | null
  positives?: string[]
  negatives?: string[]
  opportunities?: string[]
  recommended_response?: string | null
}

const BUSINESS_MODEL_LABELS: Record<string, string> = {
  B2B: 'B2B', B2C: 'B2C', B2B2C: 'B2B2C', mixed: 'מעורב',
}

// Read-only chip list.
function Tags({ tags }: { tags: string[] | undefined | null }) {
  if (!tags || tags.length === 0) return <span className="text-sm text-muted-foreground">לא הוגדר</span>
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((t, i) => (
        <Badge key={i} variant="secondary" className="text-sm">{t}</Badge>
      ))}
    </div>
  )
}

// ── Main component (READ-ONLY) ──────────────────────────────────────────────
// Editing of every field shown here lives in /app/settings. This page is a
// read-only "what the AI understands about your business" overview + the
// generated analysis outputs (SWOT, reviews).

export default function ProfilePage() {
  const [loading, setLoading] = useState(true)

  const [companyName, setCompanyName] = useState("")
  const [companyCity, setCompanyCity] = useState("")
  const [companyPhone, setCompanyPhone] = useState("")
  const [companyWebsite, setCompanyWebsite] = useState("")
  const [companyIndustry, setCompanyIndustry] = useState("")
  const [companyDescription, setCompanyDescription] = useState("")
  const [swot, setSwot] = useState<SwotData | null>(null)
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null)
  const [reviewAnalysis, setReviewAnalysis] = useState<ReviewAnalysis | null>(null)
  const [loadingReviewAnalysis, setLoadingReviewAnalysis] = useState(false)
  const [searchExpanded, setSearchExpanded] = useState(false)

  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('companies')
      .select('name, city, phone, website, industry, description, swot, business_profile, review_analysis, distribution_channels')
      .eq('id', user.id)
      .single()

    if (data) {
      setCompanyName(data.name || '')
      setCompanyCity(data.city || '')
      setCompanyPhone(data.phone || '')
      setCompanyWebsite(data.website || '')
      setCompanyIndustry(data.industry || '')
      setCompanyDescription(data.description || '')
      if (data.swot && Object.keys(data.swot).length > 0) setSwot(data.swot as SwotData)
      if (data.business_profile) {
        const bp = data.business_profile as BusinessProfile
        if (!bp.distributionChannels?.length && Array.isArray(data.distribution_channels)) {
          bp.distributionChannels = data.distribution_channels
        }
        setBusinessProfile(bp)
      }
      if (data.review_analysis && typeof data.review_analysis === 'object') {
        setReviewAnalysis(data.review_analysis as ReviewAnalysis)
      } else {
        // Surface the review analysis (cached server-side) if not yet stored.
        loadReviewAnalysis()
      }
    }
    setLoading(false)
  }

  async function loadReviewAnalysis() {
    setLoadingReviewAnalysis(true)
    try {
      const res = await fetch('/api/analyze-company-reviews', { method: 'POST' })
      const data = await res.json()
      if (data.success !== false) {
        setReviewAnalysis(data as ReviewAnalysis)
        const { data: { user } } = await supabase.auth.getUser()
        if (user) await supabase.from('companies').update({ review_analysis: data } as any).eq('id', user.id)
      }
    } catch { /* best-effort — read-only display */ }
    finally { setLoadingReviewAnalysis(false) }
  }

  if (loading) {
    return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Page title + read-only framing + link to settings for editing */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">הסקירה העסקית שלך</h1>
          <p className="text-muted-foreground text-sm max-w-xl">
            כך אנחנו מבינים את העסק שלך — זו התמונה שמניעה את כל הניתוחים. לעריכת הפרטים, עבור להגדרות.
          </p>
        </div>
        <Link
          href="/app/settings"
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10 transition-colors shrink-0"
        >
          <Settings className="h-4 w-4" />
          ערוך פרטים בהגדרות
          <ArrowLeft className="h-4 w-4" />
        </Link>
      </div>

      {/* ── Company details (read-only) ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-primary" />פרטי החברה
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2 text-sm">
            {companyName && <div className="flex gap-2"><span className="text-muted-foreground min-w-[60px]">שם:</span><span className="font-medium">{companyName}</span></div>}
            {companyPhone && <div className="flex gap-2"><span className="text-muted-foreground min-w-[60px]">טלפון:</span><span className="font-medium" dir="ltr">{companyPhone}</span></div>}
            {companyCity && <div className="flex gap-2"><span className="text-muted-foreground min-w-[60px]">עיר:</span><span className="font-medium">{companyCity}</span></div>}
            {companyWebsite && <div className="flex gap-2"><span className="text-muted-foreground min-w-[60px]">אתר:</span><a href={companyWebsite.startsWith('http') ? companyWebsite : `https://${companyWebsite}`} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline truncate" dir="ltr">{companyWebsite.replace(/^https?:\/\//, '')}</a></div>}
            {companyIndustry && <div className="flex gap-2"><span className="text-muted-foreground min-w-[60px]">תעשייה:</span><span className="font-medium">{companyIndustry}</span></div>}
            {companyDescription && <div className="col-span-2 flex gap-2"><span className="text-muted-foreground min-w-[60px]">תיאור:</span><span className="text-muted-foreground">{companyDescription}</span></div>}
            {!companyName && !companyPhone && !companyCity && !companyWebsite && !companyIndustry && (
              <p className="col-span-2 text-muted-foreground text-xs">הפרטים יתווספו לאחר ההרשמה. לעריכה, עבור להגדרות.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── SWOT (generated, read-only) ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />ניתוח SWOT
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!swot ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <p className="text-sm text-muted-foreground">הניתוח יתעדכן בסנכרון השבועי</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <h3 className="mb-3 flex items-center gap-2 font-semibold text-green-800"><TrendingUp className="h-4 w-4" />חוזקות</h3>
                <ul className="space-y-1.5">{swot.strengths.map((s, i) => <li key={i} className="flex items-start gap-2 text-sm text-green-700"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />{s}</li>)}</ul>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <h3 className="mb-3 flex items-center gap-2 font-semibold text-red-800"><TrendingDown className="h-4 w-4" />חולשות</h3>
                <ul className="space-y-1.5">{swot.weaknesses.map((w, i) => <li key={i} className="flex items-start gap-2 text-sm text-red-700"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />{w}</li>)}</ul>
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <h3 className="mb-3 flex items-center gap-2 font-semibold text-blue-800"><Plus className="h-4 w-4" />הזדמנויות</h3>
                <ul className="space-y-1.5">{swot.opportunities.map((o, i) => <li key={i} className="flex items-start gap-2 text-sm text-blue-700"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />{o}</li>)}</ul>
              </div>
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                <h3 className="mb-3 flex items-center gap-2 font-semibold text-yellow-800"><Minus className="h-4 w-4" />איומים</h3>
                <ul className="space-y-1.5">{swot.threats.map((t, i) => <li key={i} className="flex items-start gap-2 text-sm text-yellow-800"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-500" />{t}</li>)}</ul>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Review analysis (generated, read-only) ──────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />ניתוח ביקורות
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingReviewAnalysis ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>מחפש ומנתח ביקורות...</span>
            </div>
          ) : reviewAnalysis ? (
            <div className="space-y-5 py-1">
              <div className="flex flex-wrap items-center gap-3">
                {reviewAnalysis.google_rating != null ? (
                  <div className="flex items-center gap-1.5 rounded-full bg-yellow-50 border border-yellow-200 px-3 py-1">
                    <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                    <span className="text-sm font-semibold">{reviewAnalysis.google_rating.toFixed(1)}</span>
                    {reviewAnalysis.google_review_count != null && (
                      <span className="text-xs text-muted-foreground">({reviewAnalysis.google_review_count.toLocaleString()} ביקורות)</span>
                    )}
                  </div>
                ) : reviewAnalysis.not_found ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                    <p className="text-sm text-amber-800">לא נמצא ברשומות Google Maps</p>
                    <a
                      href={reviewAnalysis.google_search_url || `https://www.google.com/search?q=${encodeURIComponent(companyName)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-amber-700 hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      חפש ידנית בגוגל
                    </a>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">לא נמצא דף Google Maps</p>
                )}
                {reviewAnalysis.google_maps_url && (
                  <a
                    href={reviewAnalysis.google_maps_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    צפה בביקורות בגוגל
                  </a>
                )}
              </div>

              {reviewAnalysis.sentiment_score != null && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>ציון סנטימנט</span>
                    <span className="font-medium">{reviewAnalysis.sentiment_score}/100</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${reviewAnalysis.sentiment_score >= 70 ? 'bg-green-500' : reviewAnalysis.sentiment_score >= 45 ? 'bg-yellow-500' : 'bg-red-500'}`}
                      style={{ width: `${reviewAnalysis.sentiment_score}%` }}
                    />
                  </div>
                </div>
              )}

              {reviewAnalysis.summary && (
                <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                  {reviewAnalysis.summary}
                </div>
              )}

              {(reviewAnalysis.positives?.length || reviewAnalysis.negatives?.length || reviewAnalysis.opportunities?.length) ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {reviewAnalysis.positives?.length ? (
                    <div className="rounded-lg border border-green-200 bg-green-50/50 p-3 space-y-1.5">
                      <p className="text-xs font-semibold text-green-700">✅ חוזקות</p>
                      <ul className="space-y-1">
                        {reviewAnalysis.positives.map((p, i) => (
                          <li key={i} className="text-xs text-green-800 flex items-start gap-1.5"><span className="mt-0.5 shrink-0">•</span>{p}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {reviewAnalysis.negatives?.length ? (
                    <div className="rounded-lg border border-red-200 bg-red-50/50 p-3 space-y-1.5">
                      <p className="text-xs font-semibold text-red-700">❌ חולשות</p>
                      <ul className="space-y-1">
                        {reviewAnalysis.negatives.map((n, i) => (
                          <li key={i} className="text-xs text-red-800 flex items-start gap-1.5"><span className="mt-0.5 shrink-0">•</span>{n}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {reviewAnalysis.opportunities?.length ? (
                    <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 space-y-1.5">
                      <p className="text-xs font-semibold text-blue-700">💡 הזדמנויות</p>
                      <ul className="space-y-1">
                        {reviewAnalysis.opportunities.map((o, i) => (
                          <li key={i} className="text-xs text-blue-800 flex items-start gap-1.5"><span className="mt-0.5 shrink-0">•</span>{o}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {reviewAnalysis.recommended_response && (
                <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-3 space-y-1">
                  <p className="text-xs font-semibold text-purple-700">💬 תגובה מומלצת לביקורות שליליות</p>
                  <p className="text-xs text-purple-800">{reviewAnalysis.recommended_response}</p>
                </div>
              )}

              {reviewAnalysis.fetchedAt && (
                <p className="text-xs text-muted-foreground">עודכן: {new Date(reviewAnalysis.fetchedAt).toLocaleDateString('he-IL')}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4">לא נמצאו נתוני ביקורות</p>
          )}
        </CardContent>
      </Card>

      {/* ── Business profile (read-only) ────────────────────────────────────── */}
      {!businessProfile ? (
        <Card className="border-dashed border-2 border-primary/30">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="rounded-full bg-primary/10 p-4">
              <Search className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">הפרופיל העסקי שלך עדיין לא נותח</h3>
              <p className="mt-1 text-sm text-muted-foreground max-w-sm">
                הפרופיל העסקי נוצר אוטומטית במהלך ההרשמה. אם אינך רואה נתונים, פנה לתמיכה.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Header: core activity + model */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <p className="text-lg font-semibold text-foreground leading-snug">{businessProfile.coreActivity}</p>
              <div className="flex flex-wrap gap-2 items-center">
                <Badge className="bg-primary/10 text-primary border-primary/20 border text-sm font-medium px-3">
                  {BUSINESS_MODEL_LABELS[businessProfile.businessModel] ?? businessProfile.businessModel}
                </Badge>
                {businessProfile.marketPosition && (
                  <span className="text-sm text-muted-foreground">{businessProfile.marketPosition}</span>
                )}
              </div>
              {businessProfile.generatedAt && (
                <p className="text-xs text-muted-foreground">
                  עודכן: {new Date(businessProfile.generatedAt).toLocaleDateString('he-IL')}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Products */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Tag className="h-4 w-4 text-primary" />מוצרים ושירותים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                {businessProfile.products.length === 0 && (
                  <p className="text-sm text-muted-foreground col-span-2">לא הוגדרו מוצרים</p>
                )}
                {businessProfile.products.map((p, i) => (
                  <div key={i} className="rounded-lg border border-border bg-background p-3 space-y-1">
                    <p className="font-medium text-sm text-foreground">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.description}</p>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {p.targetAudience && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="h-3 w-3" />{p.targetAudience}
                        </span>
                      )}
                      {p.priceRange && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">💰 {p.priceRange}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Target audiences */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-primary" />קהלי יעד
              </CardTitle>
            </CardHeader>
            <CardContent><Tags tags={businessProfile.targetAudiences} /></CardContent>
          </Card>

          {/* Industry tags */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4 text-primary" />תגיות תעשייה
              </CardTitle>
            </CardHeader>
            <CardContent><Tags tags={businessProfile.industryTags} /></CardContent>
          </Card>

          {/* Geographic markets */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="h-4 w-4 text-primary" />שווקים גיאוגרפיים
              </CardTitle>
            </CardHeader>
            <CardContent><Tags tags={businessProfile.geographicMarkets} /></CardContent>
          </Card>

          {/* Distribution channels */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Truck className="h-4 w-4 text-primary" />ערוצי הפצה
              </CardTitle>
            </CardHeader>
            <CardContent><Tags tags={businessProfile.distributionChannels} /></CardContent>
          </Card>

          {/* Competitive advantage */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Trophy className="h-4 w-4 text-primary" />יתרון תחרותי
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-foreground leading-relaxed">
                {businessProfile.competitiveAdvantage || <span className="text-muted-foreground">לא הוגדר</span>}
              </p>
            </CardContent>
          </Card>

          {/* Direct competitors */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-primary" />מתחרים ישירים שזוהו
              </CardTitle>
            </CardHeader>
            <CardContent><Tags tags={businessProfile.directCompetitors} /></CardContent>
          </Card>

          {/* Keywords */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Key className="h-4 w-4 text-primary" />מילות מפתח
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">עיקריות</p>
                <Tags tags={businessProfile.primaryKeywords} />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">משניות</p>
                <Tags tags={businessProfile.secondaryKeywords} />
              </div>
            </CardContent>
          </Card>

          {/* Search queries (read-only, collapsible) */}
          {businessProfile.searchQueries?.length > 0 && (
            <Card>
              <CardHeader className="pb-0">
                <button
                  type="button"
                  className="flex w-full items-center justify-between"
                  onClick={() => setSearchExpanded(!searchExpanded)}
                >
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Target className="h-4 w-4 text-primary" />שאילתות חיפוש מוכנות
                    <Badge variant="secondary" className="text-xs">{businessProfile.searchQueries.length}</Badge>
                  </CardTitle>
                  {searchExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>
                <p className="text-xs text-muted-foreground pt-1">משמשות ל-AI פנימית בלבד</p>
              </CardHeader>
              {searchExpanded && (
                <CardContent className="pt-3 space-y-1.5">
                  {businessProfile.searchQueries.map((q, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2">
                      <span className="text-xs font-mono text-muted-foreground shrink-0">{i + 1}.</span>
                      <span className="text-sm text-foreground">{q}</span>
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
