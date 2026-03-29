"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Building2,
  Loader2,
  Star,
  RefreshCw,
  Sparkles,
  Plus,
  TrendingUp,
  TrendingDown,
  Minus,
  Phone,
  Globe,
  MapPin,
  Search,
  Pencil,
  Check,
  X,
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
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import type { BusinessProfile } from "@/types/business-profile"

// ── Helpers ────────────────────────────────────────────────────────────────

interface SwotData {
  strengths: string[]
  weaknesses: string[]
  opportunities: string[]
  threats: string[]
}

interface PlacesData {
  rating: number | null
  reviewCount: number
  reviews: Array<{ author: string; rating: number; text: string; time: string }>
  address?: string
  phone?: string
  website?: string
  source?: string
  error?: string
}

interface ReviewSource {
  name: string
  rating: number | null
  review_count: number | null
  url: string | null
}

interface ReviewAnalysis {
  sources: ReviewSource[]
  weighted_average: number | null
  sentiment_score: number | null
  overallSentiment: string
  totalReviewsFound: number
  positiveThemes: string[]
  negativeThemes: string[]
  recurringComplaints: string[]
  opportunities: string[]
  summary: string
  fetchedAt?: string
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className={`h-4 w-4 ${i <= Math.round(rating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
      ))}
    </div>
  )
}

// ── Inline edit sub-components ─────────────────────────────────────────────

function TagList({
  tags,
  onChange,
  editing,
}: {
  tags: string[]
  onChange: (t: string[]) => void
  editing: boolean
}) {
  const [input, setInput] = useState("")
  const add = () => {
    const v = input.trim()
    if (v && !tags.includes(v)) onChange([...tags, v])
    setInput("")
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t, i) => (
          <Badge key={i} variant="secondary" className="gap-1 pr-1 text-sm">
            {t}
            {editing && (
              <button type="button" onClick={() => onChange(tags.filter((_, idx) => idx !== i))} className="rounded hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        ))}
        {tags.length === 0 && <span className="text-sm text-muted-foreground">לא הוגדר</span>}
      </div>
      {editing && (
        <div className="flex gap-2">
          <Input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
            placeholder="הוסף..." className="h-8 bg-background text-sm" />
          <Button type="button" variant="outline" size="sm" onClick={add} disabled={!input.trim()}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
}

const BUSINESS_MODEL_LABELS: Record<string, string> = {
  B2B: 'B2B', B2C: 'B2C', B2B2C: 'B2B2C', mixed: 'מעורב',
}
const STAGE_LABELS: Record<string, string> = {
  startup: 'סטארטאפ', growing: 'בצמיחה', established: 'מבוסס', enterprise: 'ארגוני',
}
const STAGE_COLORS: Record<string, string> = {
  startup: 'bg-purple-100 text-purple-800 border-purple-200',
  growing: 'bg-blue-100 text-blue-800 border-blue-200',
  established: 'bg-green-100 text-green-800 border-green-200',
  enterprise: 'bg-orange-100 text-orange-800 border-orange-200',
}

// ── Main component ─────────────────────────────────────────────────────────

export default function ProfilePage() {
  const [loading, setLoading] = useState(true)
  const [generatingOverview, setGeneratingOverview] = useState(false)
  const [generatingSwot, setGeneratingSwot] = useState(false)
  const [loadingPlaces, setLoadingPlaces] = useState(false)
  const [analyzingDeep, setAnalyzingDeep] = useState(false)
  const [updatingAll, setUpdatingAll] = useState(false)

  const [companyName, setCompanyName] = useState("")
  const [companyCity, setCompanyCity] = useState("")
  const [companyPhone, setCompanyPhone] = useState("")
  const [companyWebsite, setCompanyWebsite] = useState("")
  const [companyIndustry, setCompanyIndustry] = useState("")
  const [companyDescription, setCompanyDescription] = useState("")
  const [overview, setOverview] = useState<string>("")
  const [savingCompany, setSavingCompany] = useState(false)
  const [editingCompany, setEditingCompany] = useState(false)
  const [swot, setSwot] = useState<SwotData | null>(null)
  const [places, setPlaces] = useState<PlacesData | null>(null)
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null)

  // Section edit states
  const [editSection, setEditSection] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Local edit buffers (populated when entering edit mode)
  const [editCoreActivity, setEditCoreActivity] = useState("")
  const [editTargetAudiences, setEditTargetAudiences] = useState<string[]>([])
  const [editIndustryTags, setEditIndustryTags] = useState<string[]>([])
  const [editGeoMarkets, setEditGeoMarkets] = useState<string[]>([])
  const [editAdvantage, setEditAdvantage] = useState("")
  const [editCompetitors, setEditCompetitors] = useState<string[]>([])
  const [editPrimaryKw, setEditPrimaryKw] = useState<string[]>([])
  const [editSecondaryKw, setEditSecondaryKw] = useState<string[]>([])
  const [editProducts, setEditProducts] = useState<BusinessProfile['products']>([])
  const [editDistributionChannels, setEditDistributionChannels] = useState<string[]>([])
  const [searchExpanded, setSearchExpanded] = useState(false)
  const [reviewAnalysis, setReviewAnalysis] = useState<ReviewAnalysis | null>(null)
  const [loadingReviewAnalysis, setLoadingReviewAnalysis] = useState(false)

  const supabase = createClient()
  const { toast } = useToast()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('companies')
      .select('name, city, phone, website, industry, description, swot, business_overview, geo_data, business_profile, review_analysis, distribution_channels')
      .eq('id', user.id)
      .single()

    if (data) {
      setCompanyName(data.name || '')
      setCompanyCity(data.city || '')
      setCompanyPhone(data.phone || '')
      setCompanyWebsite(data.website || '')
      setCompanyIndustry(data.industry || '')
      setCompanyDescription(data.description || '')
      if (data.business_overview) setOverview(data.business_overview)
      if (data.swot && Object.keys(data.swot).length > 0) setSwot(data.swot as SwotData)
      if (data.geo_data && typeof data.geo_data === 'object' && Object.keys(data.geo_data).length > 0) {
        setPlaces(data.geo_data as PlacesData)
      }
      if (data.business_profile) {
        const bp = data.business_profile as BusinessProfile
        // Merge top-level distribution_channels into profile if not already there
        if (!bp.distributionChannels?.length && Array.isArray(data.distribution_channels)) {
          bp.distributionChannels = data.distribution_channels
        }
        setBusinessProfile(bp)
      }
      if (data.review_analysis && typeof data.review_analysis === 'object') {
        setReviewAnalysis(data.review_analysis as ReviewAnalysis)
      }
    }
    setLoading(false)
  }

  async function saveCompanyDetails() {
    setSavingCompany(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { error } = await supabase.from('companies').update({
        name: companyName.trim(),
        city: companyCity.trim(),
        phone: companyPhone.trim(),
        website: companyWebsite.trim(),
        industry: companyIndustry.trim(),
        description: companyDescription.trim(),
      }).eq('id', user.id)
      if (error) throw error
      setEditingCompany(false)
      toast({ title: "פרטי החברה עודכנו" })
    } catch {
      toast({ title: "שגיאה בשמירה", variant: "destructive" })
    } finally {
      setSavingCompany(false)
    }
  }

  async function patchProfile(partial: Partial<BusinessProfile>) {
    setSaving(true)
    const optimistic = { ...businessProfile!, ...partial }
    setBusinessProfile(optimistic) // optimistic update
    try {
      const res = await fetch('/api/update-business-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      if (data.profile) setBusinessProfile(data.profile as BusinessProfile)
      setEditSection(null)
      toast({ title: "נשמר בהצלחה" })
    } catch {
      setBusinessProfile(businessProfile) // rollback
      toast({ title: "שגיאה בשמירה", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  function startEdit(section: string) {
    if (!businessProfile) return
    setEditSection(section)
    switch (section) {
      case 'core': setEditCoreActivity(businessProfile.coreActivity); break
      case 'audiences': setEditTargetAudiences([...businessProfile.targetAudiences]); break
      case 'industry': setEditIndustryTags([...businessProfile.industryTags]); break
      case 'geo': setEditGeoMarkets([...businessProfile.geographicMarkets]); break
      case 'advantage': setEditAdvantage(businessProfile.competitiveAdvantage); break
      case 'competitors': setEditCompetitors([...businessProfile.directCompetitors]); break
      case 'keywords': setEditPrimaryKw([...businessProfile.primaryKeywords]); setEditSecondaryKw([...businessProfile.secondaryKeywords]); break
      case 'products': setEditProducts(businessProfile.products.map(p => ({ ...p }))); break
      case 'distribution': setEditDistributionChannels([...(businessProfile.distributionChannels || [])]); break
    }
  }

  function cancelEdit() { setEditSection(null) }

  async function generateOverview() {
    setGeneratingOverview(true)
    try {
      const res = await fetch('/api/generate-overview', { method: 'POST' })
      const data = await res.json()
      if (data.success && data.overview) {
        setOverview(data.overview)
        // Belt-and-suspenders: ensure it's saved to DB
        const { data: { user } } = await supabase.auth.getUser()
        if (user) await supabase.from('companies').update({ business_overview: data.overview }).eq('id', user.id)
        toast({ title: "הסקירה עודכנה בהצלחה" })
      } else toast({ title: "שגיאה", description: data.error || "לא הצלחנו ליצור סקירה", variant: "destructive" })
    } catch { toast({ title: "שגיאה", description: "אירעה שגיאה", variant: "destructive" }) }
    finally { setGeneratingOverview(false) }
  }

  async function generateSwot() {
    setGeneratingSwot(true)
    try {
      const res = await fetch('/api/generate-swot', { method: 'POST' })
      const data = await res.json()
      if (data.success && data.swot) {
        setSwot(data.swot)
        // Ensure saved to DB even if API DB save failed
        const { data: { user } } = await supabase.auth.getUser()
        if (user) await supabase.from('companies').update({ swot: data.swot }).eq('id', user.id)
        toast({ title: "ניתוח SWOT נוצר בהצלחה" })
      } else toast({ title: "שגיאה", description: data.error || "לא הצלחנו ליצור ניתוח", variant: "destructive" })
    } catch { toast({ title: "שגיאה", description: "אירעה שגיאה", variant: "destructive" }) }
    finally { setGeneratingSwot(false) }
  }

  async function loadPlaces() {
    setLoadingPlaces(true)
    try {
      const res = await fetch('/api/google-places')
      setPlaces(await res.json())
    } catch {
      setPlaces({ rating: null, reviewCount: 0, reviews: [], error: 'שגיאה בטעינת נתוני Google' })
    } finally { setLoadingPlaces(false) }
  }

  async function loadReviewAnalysis(force = false) {
    setLoadingReviewAnalysis(true)
    try {
      const url = force ? '/api/analyze-company-reviews?force=true' : '/api/analyze-company-reviews'
      const res = await fetch(url, { method: 'POST' })
      const data = await res.json()
      if (data.success !== false) setReviewAnalysis(data as ReviewAnalysis)
      else toast({ title: "שגיאה", description: data.error || "לא ניתן לטעון ניתוח ביקורות", variant: "destructive" })
    } catch {
      toast({ title: "שגיאה", description: "אירעה שגיאה", variant: "destructive" })
    } finally { setLoadingReviewAnalysis(false) }
  }

  async function updateAll() {
    setUpdatingAll(true)
    try {
      await analyzeDeep()
      await generateSwot()
      await loadReviewAnalysis(true)
      toast({ title: "הכל עודכן בהצלחה" })
    } catch { toast({ title: "שגיאה בעדכון", variant: "destructive" }) }
    finally { setUpdatingAll(false) }
  }

  async function analyzeDeep() {
    setAnalyzingDeep(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: company } = await supabase.from('companies').select('name, website, description').eq('id', user.id).single()
      const res = await fetch('/api/analyze-business-deep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName: company?.name || '', website: company?.website || '', shortDescription: company?.description || '' }),
      })
      const data = await res.json()
      if (data.success && data.profile) {
        setBusinessProfile(data.profile)
        // API already saves to DB; also save directly for reliability
        await supabase.from('companies').update({ business_profile: data.profile }).eq('id', user.id)
        toast({ title: "פרופיל עסקי עודכן", description: "המידע ישמש לשיפור כל הניתוחים" })
      } else toast({ title: "שגיאה", description: data.error || "לא הצלחנו לנתח את העסק", variant: "destructive" })
    } catch { toast({ title: "שגיאה", description: "אירעה שגיאה", variant: "destructive" }) }
    finally { setAnalyzingDeep(false) }
  }

  if (loading) {
    return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

  // ── Inline save/cancel bar ────────────────────────────────────────────────
  const EditBar = ({ onSave }: { onSave: () => void }) => (
    <div className="flex justify-end gap-2 mt-3">
      <Button type="button" variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>
        <X className="h-3.5 w-3.5 ml-1" />ביטול
      </Button>
      <Button type="button" size="sm" onClick={onSave} disabled={saving}>
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin ml-1" /> : <Check className="h-3.5 w-3.5 ml-1" />}
        שמור
      </Button>
    </div>
  )

  return (
    <div className="space-y-6" dir="rtl">
      {/* Page title */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">פרופיל עסקי</h1>
          <p className="text-muted-foreground text-sm">ניהול פרופיל ה-AI שמניע את כל הניתוחים</p>
        </div>
        <Button onClick={updateAll} disabled={updatingAll || analyzingDeep} variant="outline" size="sm" className="gap-2">
          {updatingAll ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />מעדכן...</> : <><RefreshCw className="h-3.5 w-3.5" />עדכן הכל</>}
        </Button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* COMPANY DETAILS CARD                                                */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4 text-primary" />פרטי החברה
            </CardTitle>
            {!editingCompany && (
              <Button variant="ghost" size="sm" onClick={() => setEditingCompany(true)} className="h-7 gap-1 text-xs">
                <Pencil className="h-3 w-3" />ערוך
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {editingCompany ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">שם חברה</label>
                  <Input value={companyName} onChange={e => setCompanyName(e.target.value)} className="h-8 text-sm bg-background" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">טלפון</label>
                  <Input dir="ltr" value={companyPhone} onChange={e => setCompanyPhone(e.target.value)} placeholder="05X-XXXXXXX" className="h-8 text-sm bg-background text-left" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">עיר</label>
                  <Input value={companyCity} onChange={e => setCompanyCity(e.target.value)} className="h-8 text-sm bg-background" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">אתר אינטרנט</label>
                  <Input dir="ltr" value={companyWebsite} onChange={e => setCompanyWebsite(e.target.value)} placeholder="https://" className="h-8 text-sm bg-background text-left" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">תעשייה</label>
                  <Input value={companyIndustry} onChange={e => setCompanyIndustry(e.target.value)} className="h-8 text-sm bg-background" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">תיאור מוצרים/שירותים</label>
                <Textarea value={companyDescription} onChange={e => setCompanyDescription(e.target.value)} className="min-h-[80px] text-sm bg-background" />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditingCompany(false)} disabled={savingCompany}>
                  <X className="h-3.5 w-3.5 ml-1" />ביטול
                </Button>
                <Button type="button" size="sm" onClick={saveCompanyDetails} disabled={savingCompany}>
                  {savingCompany ? <Loader2 className="h-3.5 w-3.5 animate-spin ml-1" /> : <Check className="h-3.5 w-3.5 ml-1" />}
                  שמור
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2 text-sm">
              {companyName && <div className="flex gap-2"><span className="text-muted-foreground min-w-[60px]">שם:</span><span className="font-medium">{companyName}</span></div>}
              {companyPhone && <div className="flex gap-2"><span className="text-muted-foreground min-w-[60px]">טלפון:</span><span className="font-medium" dir="ltr">{companyPhone}</span></div>}
              {companyCity && <div className="flex gap-2"><span className="text-muted-foreground min-w-[60px]">עיר:</span><span className="font-medium">{companyCity}</span></div>}
              {companyWebsite && <div className="flex gap-2"><span className="text-muted-foreground min-w-[60px]">אתר:</span><a href={companyWebsite.startsWith('http') ? companyWebsite : `https://${companyWebsite}`} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline truncate" dir="ltr">{companyWebsite.replace(/^https?:\/\//, '')}</a></div>}
              {companyIndustry && <div className="flex gap-2"><span className="text-muted-foreground min-w-[60px]">תעשייה:</span><span className="font-medium">{companyIndustry}</span></div>}
              {companyDescription && <div className="col-span-2 flex gap-2"><span className="text-muted-foreground min-w-[60px]">תיאור:</span><span className="text-muted-foreground line-clamp-2">{companyDescription}</span></div>}
              {!companyName && !companyPhone && !companyCity && !companyWebsite && !companyIndustry && (
                <p className="col-span-2 text-muted-foreground text-xs">לחץ "ערוך" כדי להוסיף פרטי חברה</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* DEEP BUSINESS PROFILE SECTION                                       */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      {!businessProfile ? (
        /* Empty state */
        <Card className="border-dashed border-2 border-primary/30">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="rounded-full bg-primary/10 p-4">
              <Search className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">הפרופיל העסקי שלך עדיין לא נותח</h3>
              <p className="mt-1 text-sm text-muted-foreground max-w-sm">
                לחץ כדי לנתח את העסק שלך עם AI ולקבל תובנות מעמיקות — מוצרים, קהלי יעד, מתחרים, מילות מפתח ועוד.
              </p>
            </div>
            <Button onClick={analyzeDeep} disabled={analyzingDeep} size="lg" className="gap-2">
              {analyzingDeep
                ? <><Loader2 className="h-4 w-4 animate-spin" />מנתח...</>
                : <><Search className="h-4 w-4" />נתח עכשיו 🔍</>
              }
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">

          {/* ── 1. Header card ─────────────────────────────────────────────── */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="space-y-1 flex-1">
                  {editSection === 'core' ? (
                    <>
                      <Textarea
                        value={editCoreActivity}
                        onChange={e => setEditCoreActivity(e.target.value)}
                        className="text-base min-h-[72px] bg-background"
                      />
                      <EditBar onSave={() => patchProfile({ coreActivity: editCoreActivity })} />
                    </>
                  ) : (
                    <div className="flex items-start gap-2 group">
                      <p className="text-lg font-semibold text-foreground leading-snug flex-1">{businessProfile.coreActivity}</p>
                      <button type="button" onClick={() => startEdit('core')} className="opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">
                        <Pencil className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Badges row */}
              <div className="flex flex-wrap gap-2 items-center">
                <Badge className="bg-primary/10 text-primary border-primary/20 border text-sm font-medium px-3">
                  {BUSINESS_MODEL_LABELS[businessProfile.businessModel] ?? businessProfile.businessModel}
                </Badge>
                <Badge className={`border text-sm font-medium px-3 ${STAGE_COLORS[businessProfile.companyStage] ?? 'bg-muted text-muted-foreground'}`}>
                  {STAGE_LABELS[businessProfile.companyStage] ?? businessProfile.companyStage}
                </Badge>
                {businessProfile.marketPosition && (
                  <span className="text-sm text-muted-foreground">{businessProfile.marketPosition}</span>
                )}
              </div>

              {/* Confidence bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>רמת ביטחון ניתוח</span>
                  <span className="font-medium">{businessProfile.confidenceScore}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${businessProfile.confidenceScore >= 80 ? 'bg-green-500' : businessProfile.confidenceScore >= 60 ? 'bg-yellow-500' : 'bg-red-400'}`}
                    style={{ width: `${businessProfile.confidenceScore}%` }}
                  />
                </div>
              </div>

              {businessProfile.generatedAt && (
                <p className="text-xs text-muted-foreground">
                  עודכן: {new Date(businessProfile.generatedAt).toLocaleDateString('he-IL')}
                </p>
              )}
            </CardContent>
          </Card>

          {/* ── 2. Products ────────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Tag className="h-4 w-4 text-primary" />מוצרים ושירותים
                </CardTitle>
                {editSection !== 'products' && (
                  <Button variant="ghost" size="sm" onClick={() => startEdit('products')} className="h-7 gap-1 text-xs">
                    <Pencil className="h-3 w-3" />ערוך
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {editSection === 'products' ? (
                <>
                  <div className="space-y-2">
                    {editProducts.map((p, i) => (
                      <div key={i} className="flex items-start gap-2 rounded-lg border border-border bg-background p-3">
                        <div className="flex-1 space-y-1.5 min-w-0">
                          <Input value={p.name} onChange={e => setEditProducts(editProducts.map((x, xi) => xi === i ? { ...x, name: e.target.value } : x))}
                            placeholder="שם המוצר" className="h-7 bg-card text-sm" />
                          <Input value={p.description} onChange={e => setEditProducts(editProducts.map((x, xi) => xi === i ? { ...x, description: e.target.value } : x))}
                            placeholder="תיאור" className="h-7 bg-card text-sm" />
                          <div className="flex gap-2">
                            <Input value={p.targetAudience} onChange={e => setEditProducts(editProducts.map((x, xi) => xi === i ? { ...x, targetAudience: e.target.value } : x))}
                              placeholder="קהל יעד" className="h-7 bg-card text-sm flex-1" />
                            <Input value={p.priceRange || ''} onChange={e => setEditProducts(editProducts.map((x, xi) => xi === i ? { ...x, priceRange: e.target.value } : x))}
                              placeholder="טווח מחיר" className="h-7 bg-card text-sm w-32" />
                          </div>
                        </div>
                        <button type="button" onClick={() => setEditProducts(editProducts.filter((_, xi) => xi !== i))} className="text-muted-foreground hover:text-destructive mt-1">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" className="w-full gap-1"
                      onClick={() => setEditProducts([...editProducts, { name: '', description: '', targetAudience: '', priceRange: '' }])}>
                      <Plus className="h-3.5 w-3.5" />הוסף מוצר
                    </Button>
                  </div>
                  <EditBar onSave={() => patchProfile({ products: editProducts.filter(p => p.name.trim()) })} />
                </>
              ) : (
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
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            💰 {p.priceRange}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── 3. Target Audiences ─────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4 text-primary" />קהלי יעד
                </CardTitle>
                {editSection !== 'audiences' && (
                  <Button variant="ghost" size="sm" onClick={() => startEdit('audiences')} className="h-7 gap-1 text-xs">
                    <Pencil className="h-3 w-3" />ערוך
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <TagList tags={editSection === 'audiences' ? editTargetAudiences : businessProfile.targetAudiences}
                onChange={setEditTargetAudiences} editing={editSection === 'audiences'} />
              {editSection === 'audiences' && <EditBar onSave={() => patchProfile({ targetAudiences: editTargetAudiences })} />}
            </CardContent>
          </Card>

          {/* ── 4. Industry Tags ────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Building2 className="h-4 w-4 text-primary" />תגיות תעשייה
                </CardTitle>
                {editSection !== 'industry' && (
                  <Button variant="ghost" size="sm" onClick={() => startEdit('industry')} className="h-7 gap-1 text-xs">
                    <Pencil className="h-3 w-3" />ערוך
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <TagList tags={editSection === 'industry' ? editIndustryTags : businessProfile.industryTags}
                onChange={setEditIndustryTags} editing={editSection === 'industry'} />
              {editSection === 'industry' && <EditBar onSave={() => patchProfile({ industryTags: editIndustryTags })} />}
            </CardContent>
          </Card>

          {/* ── 5. Geographic Markets ───────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <MapPin className="h-4 w-4 text-primary" />שווקים גיאוגרפיים
                </CardTitle>
                {editSection !== 'geo' && (
                  <Button variant="ghost" size="sm" onClick={() => startEdit('geo')} className="h-7 gap-1 text-xs">
                    <Pencil className="h-3 w-3" />ערוך
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <TagList tags={editSection === 'geo' ? editGeoMarkets : businessProfile.geographicMarkets}
                onChange={setEditGeoMarkets} editing={editSection === 'geo'} />
              {editSection === 'geo' && <EditBar onSave={() => patchProfile({ geographicMarkets: editGeoMarkets })} />}
            </CardContent>
          </Card>

          {/* ── 5b. Distribution Channels ───────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Truck className="h-4 w-4 text-primary" />ערוצי הפצה
                </CardTitle>
                {editSection !== 'distribution' && (
                  <Button variant="ghost" size="sm" onClick={() => startEdit('distribution')} className="h-7 gap-1 text-xs">
                    <Pencil className="h-3 w-3" />ערוך
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <TagList
                tags={editSection === 'distribution' ? editDistributionChannels : (businessProfile.distributionChannels || [])}
                onChange={setEditDistributionChannels}
                editing={editSection === 'distribution'}
              />
              {editSection === 'distribution' && (
                <EditBar onSave={() => patchProfile({ distributionChannels: editDistributionChannels })} />
              )}
            </CardContent>
          </Card>

          {/* ── 6. Competitive Advantage ────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Trophy className="h-4 w-4 text-primary" />יתרון תחרותי
                </CardTitle>
                {editSection !== 'advantage' && (
                  <Button variant="ghost" size="sm" onClick={() => startEdit('advantage')} className="h-7 gap-1 text-xs">
                    <Pencil className="h-3 w-3" />ערוך
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {editSection === 'advantage' ? (
                <>
                  <Textarea value={editAdvantage} onChange={e => setEditAdvantage(e.target.value)}
                    className="min-h-[80px] bg-background text-sm" />
                  <EditBar onSave={() => patchProfile({ competitiveAdvantage: editAdvantage })} />
                </>
              ) : (
                <p className="text-sm text-foreground leading-relaxed">
                  {businessProfile.competitiveAdvantage || <span className="text-muted-foreground">לא הוגדר</span>}
                </p>
              )}
            </CardContent>
          </Card>

          {/* ── 7. Direct Competitors ───────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="h-4 w-4 text-primary" />מתחרים ישירים שזוהו
                </CardTitle>
                {editSection !== 'competitors' && (
                  <Button variant="ghost" size="sm" onClick={() => startEdit('competitors')} className="h-7 gap-1 text-xs">
                    <Pencil className="h-3 w-3" />ערוך
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <TagList tags={editSection === 'competitors' ? editCompetitors : businessProfile.directCompetitors}
                onChange={setEditCompetitors} editing={editSection === 'competitors'} />
              {editSection === 'competitors' && <EditBar onSave={() => patchProfile({ directCompetitors: editCompetitors })} />}
            </CardContent>
          </Card>

          {/* ── 8. Keywords ─────────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Key className="h-4 w-4 text-primary" />מילות מפתח
                </CardTitle>
                {editSection !== 'keywords' && (
                  <Button variant="ghost" size="sm" onClick={() => startEdit('keywords')} className="h-7 gap-1 text-xs">
                    <Pencil className="h-3 w-3" />ערוך
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">עיקריות</p>
                <TagList tags={editSection === 'keywords' ? editPrimaryKw : businessProfile.primaryKeywords}
                  onChange={setEditPrimaryKw} editing={editSection === 'keywords'} />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">משניות</p>
                <TagList tags={editSection === 'keywords' ? editSecondaryKw : businessProfile.secondaryKeywords}
                  onChange={setEditSecondaryKw} editing={editSection === 'keywords'} />
              </div>
              {editSection === 'keywords' && (
                <EditBar onSave={() => patchProfile({ primaryKeywords: editPrimaryKw, secondaryKeywords: editSecondaryKw })} />
              )}
            </CardContent>
          </Card>

          {/* ── 9. Search Queries (read-only, collapsible) ──────────────────── */}
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

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* EXISTING SECTIONS                                                    */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      {/* SWOT */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />ניתוח SWOT
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!swot ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <p className="text-sm text-muted-foreground">לחץ "עדכן הכל" לקבלת ניתוח SWOT</p>
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

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* REVIEW ANALYSIS (includes Google Maps as first source)              */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />ניתוח ביקורות
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!reviewAnalysis ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <p className="text-sm text-muted-foreground">לחץ "עדכן הכל" לניתוח ביקורות מכל המקורות</p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Summary scores */}
              <div className="flex flex-wrap gap-4">
                {reviewAnalysis.weighted_average != null && (
                  <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-center min-w-[100px]">
                    <p className="text-2xl font-bold">{reviewAnalysis.weighted_average.toFixed(1)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">ממוצע משוקלל</p>
                  </div>
                )}
                {reviewAnalysis.sentiment_score != null && (
                  <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-center min-w-[100px]">
                    <p className="text-2xl font-bold">{reviewAnalysis.sentiment_score.toFixed(1)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">ציון סנטימנט</p>
                  </div>
                )}
                {reviewAnalysis.totalReviewsFound > 0 && (
                  <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-center min-w-[100px]">
                    <p className="text-2xl font-bold">{reviewAnalysis.totalReviewsFound}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">ביקורות סה&quot;כ</p>
                  </div>
                )}
                {reviewAnalysis.overallSentiment && (
                  <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-center min-w-[100px]">
                    <p className="text-lg font-semibold">{reviewAnalysis.overallSentiment}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">סנטימנט כולל</p>
                  </div>
                )}
              </div>

              {/* Per-source breakdown — Google Maps always first if available */}
              {(() => {
                const baseSources = reviewAnalysis.sources || []
                // Inject Google Maps from geo_data as the first source
                let mergedSources = [...baseSources]
                if (places?.rating) {
                  const googleEntry: ReviewSource = {
                    name: 'Google Maps',
                    rating: places.rating,
                    review_count: places.reviewCount,
                    url: `https://www.google.com/maps/search/${encodeURIComponent(`${companyName} ${companyCity}`.trim())}`,
                  }
                  const existingGoogleIdx = mergedSources.findIndex(s => s.name.toLowerCase().includes('google'))
                  if (existingGoogleIdx >= 0) mergedSources[existingGoogleIdx] = googleEntry
                  else mergedSources = [googleEntry, ...mergedSources]
                }
                return mergedSources.length > 0 ? (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/40">
                          <th className="text-right py-2 px-3 font-medium">מקור</th>
                          <th className="text-right py-2 px-3 font-medium">דירוג</th>
                          <th className="text-right py-2 px-3 font-medium">ביקורות</th>
                          <th className="py-2 px-3" />
                        </tr>
                      </thead>
                      <tbody>
                        {mergedSources.map((s, i) => (
                          <tr key={i} className="border-b border-border last:border-0">
                            <td className="py-2 px-3 font-medium">{s.name}</td>
                            <td className="py-2 px-3">
                              {s.rating != null ? (
                                <span className="flex items-center gap-1">
                                  <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                                  {s.rating.toFixed(1)}
                                </span>
                              ) : '—'}
                            </td>
                            <td className="py-2 px-3 text-muted-foreground">{s.review_count ?? '—'}</td>
                            <td className="py-2 px-3">
                              {s.url && (
                                <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 text-xs">
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null
              })()}

              {/* Summary */}
              {reviewAnalysis.summary && (
                <p className="text-sm text-muted-foreground leading-relaxed">{reviewAnalysis.summary}</p>
              )}

              {/* Themes */}
              {(reviewAnalysis.positiveThemes.length > 0 || reviewAnalysis.negativeThemes.length > 0) && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {reviewAnalysis.positiveThemes.length > 0 && (
                    <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                      <p className="text-xs font-semibold text-green-800 mb-2">חוזקות לפי ביקורות</p>
                      <ul className="space-y-1">
                        {reviewAnalysis.positiveThemes.map((t, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-sm text-green-700">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />{t}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {reviewAnalysis.negativeThemes.length > 0 && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                      <p className="text-xs font-semibold text-red-800 mb-2">חולשות לפי ביקורות</p>
                      <ul className="space-y-1">
                        {reviewAnalysis.negativeThemes.map((t, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-sm text-red-700">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />{t}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Opportunities from reviews */}
              {reviewAnalysis.opportunities.length > 0 && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <p className="text-xs font-semibold text-blue-800 mb-2">הזדמנויות שזוהו</p>
                  <ul className="space-y-1">
                    {reviewAnalysis.opportunities.map((o, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-sm text-blue-700">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />{o}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {reviewAnalysis.fetchedAt && (
                <p className="text-xs text-muted-foreground">עודכן: {new Date(reviewAnalysis.fetchedAt).toLocaleDateString('he-IL')}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
