"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Sparkles,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { createClient } from "@/lib/supabase/client"
import type { BusinessProfile } from "@/types/business-profile"

// ──────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────

const OWNER_ROLES = [
  'מנכ"ל / בעלים',
  'מנהל שיווק',
  'מנהל מכירות',
  'מנהל פיתוח עסקי',
  'מנהל מוצר',
  'יועץ עסקי',
  'מנהל כללי',
  'אחר',
]

const GEOGRAPHIC_OPTIONS = [
  { value: 'national', label: '🇮🇱 ארצי — פעיל בכל רחבי ישראל' },
  { value: 'local', label: '🏙️ מקומי — פעיל באזור גיאוגרפי מוגדר' },
  { value: 'international', label: '🌍 בינלאומי — פעיל גם מחוץ לישראל' },
]

const BUSINESS_MODEL_OPTIONS: Array<{ value: BusinessProfile['businessModel']; label: string }> = [
  { value: 'B2B', label: 'B2B — מכירה לעסקים' },
  { value: 'B2C', label: 'B2C — מכירה לצרכנים' },
  { value: 'B2B2C', label: 'B2B2C — גם לעסקים וגם לצרכנים' },
  { value: 'mixed', label: 'מעורב' },
]

const WIZARD_STEPS = [
  { id: 1, title: 'פעילות עיקרית' },
  { id: 2, title: 'מוצרים ושירותים' },
  { id: 3, title: 'קהלי יעד וערוצים' },
  { id: 4, title: 'תגיות ומילות מפתח' },
  { id: 5, title: 'מתחרים' },
]

const SCAN_STEPS = [
  { label: 'מנתח פרופיל עסקי...', route: '/api/generate-overview' },
  { label: 'מייצר ניתוח SWOT...', route: '/api/generate-swot' },
  { label: 'מגלה מתחרים...', route: '/api/find-competitors' },
  { label: 'מדרג SEO...', route: '/api/generate-seo-ranking' },
  { label: 'מדרג GEO...', route: '/api/generate-geo-ranking' },
  { label: 'מנתח טרנדים בתעשייה...', route: '/api/industry-trends' },
  { label: 'מנתח טרנדים מתחרים...', route: '/api/competitor-trends' },
  { label: 'מחפש חדשות...', route: '/api/generate-news' },
  { label: 'מחפש מכרזים...', route: '/api/generate-tenders' },
  { label: 'מגלה לידים...', route: '/api/generate-leads' },
  { label: 'מייצר פעולות שבועיות...', route: '/api/generate-weekly-actions' },
]

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

type Phase = 'intake' | 'analyzing' | 'wizard' | 'saving' | 'scanning'
interface WizardCompetitor { name: string; website: string; source: 'auto' | 'manual' }

// ──────────────────────────────────────────────────────────────────────────
// Helper: removable tag list with inline add
// ──────────────────────────────────────────────────────────────────────────

function TagList({
  tags,
  onChange,
  placeholder,
}: {
  tags: string[]
  onChange: (t: string[]) => void
  placeholder: string
}) {
  const [input, setInput] = useState('')
  const add = () => {
    const v = input.trim()
    if (v && !tags.includes(v)) onChange([...tags, v])
    setInput('')
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {tags.map((t, i) => (
          <Badge key={i} variant="secondary" className="gap-1 pr-1 text-sm py-1">
            {t}
            <button
              type="button"
              onClick={() => onChange(tags.filter((_, idx) => idx !== i))}
              className="rounded hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        {tags.length === 0 && (
          <span className="text-sm text-muted-foreground">לא הוגדר</span>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); add() }
          }}
          placeholder={placeholder}
          className="h-8 bg-background text-sm"
        />
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={!input.trim()}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter()

  // Phase
  const [phase, setPhase] = useState<Phase>('intake')

  // Intake form
  const [companyName, setCompanyName] = useState('')
  const [phone, setPhone] = useState('')
  const [website, setWebsite] = useState('')
  const [description, setDescription] = useState('')
  const [ownerRole, setOwnerRole] = useState('')
  const [geographicScope, setGeographicScope] = useState('national')

  // Errors
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // AI profile (raw result)
  const [deepProfile, setDeepProfile] = useState<BusinessProfile | null>(null)

  // Wizard navigation
  const [wizardStep, setWizardStep] = useState(1)

  // Wizard step 1 — core activity
  const [wCoreActivity, setWCoreActivity] = useState('')
  const [wBusinessModel, setWBusinessModel] = useState<BusinessProfile['businessModel']>('B2C')
  const [wMarketPosition, setWMarketPosition] = useState('')

  // Wizard step 2 — products
  const [wProducts, setWProducts] = useState<BusinessProfile['products']>([])
  const [newProductName, setNewProductName] = useState('')
  const [newProductDesc, setNewProductDesc] = useState('')

  // Wizard step 3 — audiences & channels
  const [wAudiences, setWAudiences] = useState<string[]>([])
  const [wChannels, setWChannels] = useState<string[]>([])

  // Wizard step 4 — tags & keywords
  const [wIndustryTags, setWIndustryTags] = useState<string[]>([])
  const [wPrimaryKw, setWPrimaryKw] = useState<string[]>([])
  const [wSecondaryKw, setWSecondaryKw] = useState<string[]>([])

  // Wizard step 5 — competitors
  const [wCompetitors, setWCompetitors] = useState<WizardCompetitor[]>([])
  const [newCompName, setNewCompName] = useState('')
  const [newCompWebsite, setNewCompWebsite] = useState('')

  // Scanning
  const [scanStep, setScanStep] = useState(0)

  // ── Analyze ─────────────────────────────────────────────────────────────

  async function handleAnalyze() {
    if (!companyName.trim() || !phone.trim()) return
    setPhase('analyzing')
    setAnalysisError(null)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/analyze-business-deep', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          companyName,
          website,
          shortDescription: description,
        }),
      })
      const data = await res.json()
      if (data.success && data.profile) {
        const p = data.profile as BusinessProfile
        setDeepProfile(p)
        setWCoreActivity(p.coreActivity || '')
        setWBusinessModel(p.businessModel || 'B2C')
        setWMarketPosition(p.marketPosition || '')
        setWProducts(p.products || [])
        setWAudiences(p.targetAudiences || [])
        setWChannels(p.distributionChannels || [])
        setWIndustryTags(p.industryTags || [])
        setWPrimaryKw(p.primaryKeywords || [])
        setWSecondaryKw(p.secondaryKeywords || [])
        const autoCompetitors: WizardCompetitor[] = (p.directCompetitors || []).map(name => ({ name, website: '', source: 'auto' as const }))
        setWCompetitors(autoCompetitors)
        // Fetch websites for auto-detected competitors in background
        autoCompetitors.forEach(async (comp) => {
          try {
            const r = await fetch('/api/lookup-competitor-website', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: comp.name }),
            })
            const { website: fetchedWebsite } = await r.json()
            if (fetchedWebsite) {
              setWCompetitors(prev => prev.map(c =>
                c.name === comp.name && c.source === 'auto' ? { ...c, website: fetchedWebsite } : c
              ))
            }
          } catch { /* silent */ }
        })
        setWizardStep(1)
        setPhase('wizard')
      } else {
        setAnalysisError(data.error || 'שגיאה בניתוח העסק, נסה שנית')
        setPhase('intake')
      }
    } catch {
      setAnalysisError('שגיאת רשת, נסה שנית')
      setPhase('intake')
    }
  }

  // ── Submit (save + scan) ─────────────────────────────────────────────────

  async function handleSubmit() {
    setSubmitError(null)
    setPhase('saving')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const updatedProfile: BusinessProfile = {
        ...(deepProfile as BusinessProfile),
        coreActivity: wCoreActivity,
        businessModel: wBusinessModel,
        marketPosition: wMarketPosition,
        products: wProducts,
        targetAudiences: wAudiences,
        distributionChannels: wChannels,
        industryTags: wIndustryTags,
        primaryKeywords: wPrimaryKw,
        secondaryKeywords: wSecondaryKw,
        directCompetitors: wCompetitors.map(c => c.name),
      }

      const { error: upsertError } = await supabase.from('companies').upsert({
        id: user.id,
        name: companyName,
        website,
        phone,
        description,
        onboarding_completed: true,
        geographic_scope: [geographicScope],
        business_profile: updatedProfile,
        keywords: [...wPrimaryKw, ...wSecondaryKw, ...wIndustryTags],
        modules: ['competitors', 'leads', 'tenders', 'trends', 'news', 'conferences'],
      })

      if (upsertError) throw upsertError

      if (wCompetitors.length > 0) {
        await supabase.from('competitors').insert(
          wCompetitors
            .filter(c => c.name.trim())
            .map(c => ({
              company_id: user.id,
              name: c.name.trim(),
              website: c.website.trim(),
              positioning: 'מתחרה ישיר',
              threat_score: Math.floor(Math.random() * 30) + 50,
              trend: 'stable',
              source: c.source,
            }))
        )
      }

      await supabase.from('alerts').insert({
        company_id: user.id,
        title: 'ברוך הבא ל-Market Radar!',
        message: 'החשבון שלך מוכן. התחל לגלות הזדמנויות עסקיות חדשות.',
        type: 'success',
        is_read: false,
      })

      const { data: { session } } = await supabase.auth.getSession()
      const authHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      }

      setPhase('scanning')
      setScanStep(0)

      for (let i = 0; i < SCAN_STEPS.length; i++) {
        setScanStep(i)
        try {
          await fetch(SCAN_STEPS[i].route, { method: 'POST', headers: authHeaders })
        } catch {
          // ignore errors, continue
        }
      }

      router.push('/app/dashboard')
    } catch (err: any) {
      setSubmitError(err?.message || 'שגיאה בלתי צפויה')
      setPhase('wizard')
      setWizardStep(5)
    }
  }

  // ── Wizard helpers ───────────────────────────────────────────────────────

  function addProduct() {
    if (!newProductName.trim()) return
    setWProducts([...wProducts, {
      name: newProductName.trim(),
      description: newProductDesc.trim(),
      targetAudience: '',
    }])
    setNewProductName('')
    setNewProductDesc('')
  }

  function addCompetitor() {
    if (!newCompName.trim()) return
    setWCompetitors([...wCompetitors, {
      name: newCompName.trim(),
      website: newCompWebsite.trim(),
      source: 'manual',
    }])
    setNewCompName('')
    setNewCompWebsite('')
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-background to-background" dir="rtl">
      {/* Background blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute right-0 top-0 h-[600px] w-[600px] rounded-full bg-teal-500/6 blur-[130px]" />
        <div className="absolute bottom-0 left-0 h-[400px] w-[400px] rounded-full bg-teal-600/4 blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-2xl px-4 py-10">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <Image
            src="/whitelogo.png"
            alt="North Star Radar"
            width={180}
            height={50}
            className="h-10 w-auto object-contain"
            unoptimized
          />
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/90 backdrop-blur-sm shadow-2xl p-8">

          {/* ── INTAKE PHASE ──────────────────────────────────────────── */}
          {phase === 'intake' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-foreground">ברוך הבא!</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  ספר לנו על העסק שלך ו-AI יבנה פרופיל עסקי מדויק תוך פחות מדקה
                </p>
              </div>

              {analysisError && (
                <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive border border-destructive/20">
                  {analysisError}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="companyName">שם החברה *</Label>
                  <Input
                    id="companyName"
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    placeholder="שם החברה שלך"
                    className="bg-background"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="phone">טלפון *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    dir="ltr"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="05X-XXXXXXX"
                    className="bg-background text-left"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="website">אתר אינטרנט</Label>
                  <Input
                    id="website"
                    type="url"
                    dir="ltr"
                    value={website}
                    onChange={e => setWebsite(e.target.value)}
                    placeholder="https://example.com"
                    className="bg-background text-left"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>תפקידך בחברה</Label>
                  <Select value={ownerRole} onValueChange={setOwnerRole}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="בחר תפקיד..." />
                    </SelectTrigger>
                    <SelectContent>
                      {OWNER_ROLES.map(r => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>איזור פעילות</Label>
                  <Select value={geographicScope} onValueChange={setGeographicScope}>
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GEOGRAPHIC_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="description">תיאור קצר</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="2-3 משפטים על מה שהעסק עושה, למי הוא מוכר ומה הוא מציע..."
                    className="min-h-[80px] bg-background"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <Button
                  onClick={handleAnalyze}
                  disabled={!companyName.trim() || !phone.trim()}
                  size="lg"
                  className="gap-2 bg-teal-600 hover:bg-teal-700 text-white min-w-[200px]"
                >
                  <Sparkles className="h-4 w-4" />
                  נתח את העסק שלי
                </Button>
              </div>
            </div>
          )}

          {/* ── ANALYZING PHASE ───────────────────────────────────────── */}
          {phase === 'analyzing' && (
            <div className="flex flex-col items-center gap-6 py-14 text-center">
              <div className="relative">
                <div className="absolute inset-0 animate-ping rounded-full bg-teal-400/20" style={{ animationDuration: '1.5s' }} />
                <div className="relative rounded-full bg-teal-500/10 p-7">
                  <Sparkles className="h-12 w-12 text-teal-500" />
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xl font-semibold text-foreground">AI מנתח את העסק שלך</p>
                <p className="text-sm text-muted-foreground">סורק אתר, מזהה מתחרים, בונה פרופיל עסקי...</p>
                <p className="text-xs text-muted-foreground">(30–60 שניות)</p>
              </div>
              <div className="w-full max-w-xs">
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-teal-500 rounded-full animate-pulse" style={{ width: '65%' }} />
                </div>
              </div>
            </div>
          )}

          {/* ── WIZARD PHASE ──────────────────────────────────────────── */}
          {phase === 'wizard' && (
            <div className="space-y-6">
              {/* Progress bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">
                    שלב {wizardStep}/5
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {WIZARD_STEPS[wizardStep - 1].title}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-teal-500 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${(wizardStep / 5) * 100}%` }}
                  />
                </div>
                <div className="flex">
                  {WIZARD_STEPS.map(s => (
                    <div key={s.id} className="flex-1 flex flex-col items-center gap-1">
                      <div className={`h-2 w-2 rounded-full transition-colors ${
                        s.id < wizardStep
                          ? 'bg-teal-500'
                          : s.id === wizardStep
                          ? 'bg-teal-400 ring-2 ring-teal-400/30'
                          : 'bg-muted-foreground/20'
                      }`} />
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Step 1: פעילות עיקרית */}
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">פעילות עיקרית</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      AI ניתח את העסק שלך — בדוק ותקן אם צריך
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label>מה העסק שלך עושה?</Label>
                    <Textarea
                      value={wCoreActivity}
                      onChange={e => setWCoreActivity(e.target.value)}
                      className="min-h-[80px] bg-background"
                      placeholder="תיאור הפעילות העיקרית של העסק..."
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>מודל עסקי</Label>
                    <Select
                      value={wBusinessModel}
                      onValueChange={v => setWBusinessModel(v as BusinessProfile['businessModel'])}
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BUSINESS_MODEL_OPTIONS.map(o => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>מיצוב בשוק</Label>
                    <Textarea
                      value={wMarketPosition}
                      onChange={e => setWMarketPosition(e.target.value)}
                      className="min-h-[60px] bg-background"
                      placeholder="איך העסק ממוצב ביחס למתחרים?"
                    />
                  </div>
                </div>
              )}

              {/* ── Step 2: מוצרים ושירותים */}
              {wizardStep === 2 && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">מוצרים ושירותים</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      המוצרים שזיהה AI — ניתן להסיר ולהוסיף
                    </p>
                  </div>

                  <div className="space-y-2">
                    {wProducts.map((p, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 rounded-lg border border-border bg-background p-4"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-foreground">{p.name}</p>
                          {p.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                              {p.description}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setWProducts(wProducts.filter((_, idx) => idx !== i))}
                          className="text-muted-foreground hover:text-destructive transition-colors shrink-0 mt-0.5"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    {wProducts.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4 border border-dashed border-border rounded-lg">
                        לא זוהו מוצרים — הוסף ידנית
                      </p>
                    )}
                  </div>

                  <div className="rounded-lg border border-dashed border-border bg-background/50 p-4 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">הוסף מוצר / שירות</p>
                    <Input
                      value={newProductName}
                      onChange={e => setNewProductName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addProduct() } }}
                      placeholder="שם המוצר או השירות"
                      className="bg-background"
                    />
                    <Input
                      value={newProductDesc}
                      onChange={e => setNewProductDesc(e.target.value)}
                      placeholder="תיאור קצר (אופציונלי)"
                      className="bg-background"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addProduct}
                      disabled={!newProductName.trim()}
                      className="gap-1"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      הוסף
                    </Button>
                  </div>
                </div>
              )}

              {/* ── Step 3: קהלי יעד וערוצי הפצה */}
              {wizardStep === 3 && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">קהלי יעד וערוצי הפצה</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      מי הלקוחות שלך ואיפה אתה מגיע אליהם
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>קהלי יעד</Label>
                    <TagList
                      tags={wAudiences}
                      onChange={setWAudiences}
                      placeholder="הוסף קהל יעד..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>ערוצי הפצה ושיווק</Label>
                    <TagList
                      tags={wChannels}
                      onChange={setWChannels}
                      placeholder="הוסף ערוץ (אתר, גוגל, רשתות חברתיות...)..."
                    />
                  </div>
                </div>
              )}

              {/* ── Step 4: תגיות ומילות מפתח */}
              {wizardStep === 4 && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">תגיות ומילות מפתח</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      בסיס לסריקת השוק — ניתן לערוך בכל עת מהפרופיל
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>תגיות תעשייה</Label>
                    <TagList
                      tags={wIndustryTags}
                      onChange={setWIndustryTags}
                      placeholder="הוסף תגית תעשייה..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>מילות מפתח ראשיות</Label>
                    <TagList
                      tags={wPrimaryKw}
                      onChange={setWPrimaryKw}
                      placeholder="הוסף מילת מפתח..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>מילות מפתח משניות</Label>
                    <TagList
                      tags={wSecondaryKw}
                      onChange={setWSecondaryKw}
                      placeholder="הוסף מילת מפתח משנית..."
                    />
                  </div>
                </div>
              )}

              {/* ── Step 5: מתחרים */}
              {wizardStep === 5 && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">מתחרים</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      AI זיהה {wCompetitors.length} מתחרים — ניתן לערוך, להסיר ולהוסיף
                    </p>
                  </div>

                  <div className="space-y-2">
                    {wCompetitors.map((c, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 rounded-lg border border-border bg-background p-3"
                      >
                        <div className="flex-1 grid sm:grid-cols-2 gap-2">
                          <Input
                            value={c.name}
                            onChange={e => setWCompetitors(
                              wCompetitors.map((x, xi) => xi === i ? { ...x, name: e.target.value } : x)
                            )}
                            placeholder="שם המתחרה"
                            className="h-8 bg-card text-sm"
                          />
                          <Input
                            value={c.website}
                            dir="ltr"
                            onChange={e => setWCompetitors(
                              wCompetitors.map((x, xi) => xi === i ? { ...x, website: e.target.value } : x)
                            )}
                            placeholder="https://..."
                            className="h-8 bg-card text-sm text-left"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setWCompetitors(wCompetitors.filter((_, xi) => xi !== i))}
                          className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    {wCompetitors.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-3 border border-dashed border-border rounded-lg">
                        לא זוהו מתחרים — הוסף ידנית
                      </p>
                    )}
                  </div>

                  <div className="rounded-lg border border-dashed border-border bg-background/50 p-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">הוסף מתחרה</p>
                    <div className="grid sm:grid-cols-2 gap-2">
                      <Input
                        value={newCompName}
                        onChange={e => setNewCompName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCompetitor() } }}
                        placeholder="שם המתחרה"
                        className="bg-background"
                      />
                      <Input
                        value={newCompWebsite}
                        onChange={e => setNewCompWebsite(e.target.value)}
                        dir="ltr"
                        placeholder="https://..."
                        className="bg-background text-left"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addCompetitor}
                      disabled={!newCompName.trim()}
                      className="gap-1"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      הוסף
                    </Button>
                  </div>

                  {submitError && (
                    <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive border border-destructive/20">
                      {submitError}
                    </div>
                  )}
                </div>
              )}

              {/* Navigation */}
              <div className="flex items-center justify-between border-t border-border pt-5 mt-4">
                <Button
                  variant="ghost"
                  onClick={() => setWizardStep(s => s - 1)}
                  disabled={wizardStep === 1}
                  className="gap-1 text-muted-foreground"
                >
                  <ChevronRight className="h-4 w-4" />
                  הקודם
                </Button>

                {wizardStep < 5 ? (
                  <Button
                    onClick={() => setWizardStep(s => s + 1)}
                    className="gap-1 bg-teal-600 hover:bg-teal-700 text-white"
                  >
                    הבא
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleSubmit}
                    className="gap-2 bg-teal-600 hover:bg-teal-700 text-white min-w-[160px]"
                  >
                    <Check className="h-4 w-4" />
                    סיים והמשך
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* ── SAVING PHASE ──────────────────────────────────────────── */}
          {phase === 'saving' && (
            <div className="flex flex-col items-center gap-4 py-14 text-center">
              <Loader2 className="h-12 w-12 animate-spin text-teal-500" />
              <p className="text-lg font-semibold text-foreground">שומר את הפרופיל שלך...</p>
              <p className="text-sm text-muted-foreground">עוד שנייה</p>
            </div>
          )}

          {/* ── SCANNING PHASE ────────────────────────────────────────── */}
          {phase === 'scanning' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="relative inline-block mb-5">
                  <div
                    className="absolute inset-0 animate-ping rounded-full bg-teal-400/20"
                    style={{ animationDuration: '1.5s' }}
                  />
                  <div className="relative rounded-full bg-teal-500/10 p-5">
                    <Sparkles className="h-9 w-9 text-teal-500" />
                  </div>
                </div>
                <h2 className="text-xl font-semibold text-foreground">מאתחל את החשבון שלך</h2>
                <p className="mt-1 text-sm text-muted-foreground">AI סורק ומנתח — עוד כמה רגעים ואתה מוכן</p>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-teal-500 rounded-full transition-all duration-700"
                  style={{ width: `${((scanStep + 1) / SCAN_STEPS.length) * 100}%` }}
                />
              </div>

              <div className="space-y-1.5">
                {SCAN_STEPS.map((step, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
                      i === scanStep
                        ? 'border-teal-500/30 bg-teal-500/5'
                        : i < scanStep
                        ? 'border-border bg-background opacity-60'
                        : 'border-border bg-background'
                    }`}
                  >
                    <div className="shrink-0">
                      {i < scanStep ? (
                        <Check className="h-4 w-4 text-teal-500" />
                      ) : i === scanStep ? (
                        <Loader2 className="h-4 w-4 animate-spin text-teal-500" />
                      ) : (
                        <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/25" />
                      )}
                    </div>
                    <span className={`text-sm flex-1 ${
                      i === scanStep
                        ? 'text-foreground font-medium'
                        : i < scanStep
                        ? 'text-muted-foreground'
                        : 'text-muted-foreground'
                    }`}>
                      ({i + 1}/{SCAN_STEPS.length}) {step.label}
                    </span>
                    {i < scanStep && (
                      <span className="text-xs text-teal-600 font-medium shrink-0">הושלם</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
