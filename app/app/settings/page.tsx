"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { X, Plus, Save, Building2, User, Loader2, MessageCircle, Users, Tag, Target, Trophy, Sparkles } from "lucide-react"

// Reusable add/remove chip editor for a string[] field, with a friendly
// explanation and a save button. Matches the existing settings card styling.
function ChipEditor({
  icon: Icon, title, explanation, items, onItemsChange, onSave, saving, placeholder,
}: {
  icon?: any
  title: string
  explanation: string
  items: string[]
  onItemsChange: (next: string[]) => void
  onSave: () => void
  saving: boolean
  placeholder: string
}) {
  const [val, setVal] = useState("")
  const add = () => {
    const t = val.trim()
    if (t && !items.includes(t)) { onItemsChange([...items, t]); setVal("") }
  }
  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-foreground flex items-center gap-2 text-base">
          {Icon && <Icon className="h-4 w-4 text-primary" />}{title}
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">{explanation}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder={placeholder}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            className="border-border bg-input"
          />
          <Button onClick={add} className="bg-primary text-primary-foreground"><Plus className="h-4 w-4" /></Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">לא הוגדרו עדיין</p>
          ) : (
            items.map((it) => (
              <Badge key={it} variant="secondary" className="flex items-center gap-1 bg-primary/10 px-3 py-1.5 text-primary">
                <span dir="rtl">{it}</span>
                <button onClick={() => onItemsChange(items.filter((x) => x !== it))} className="mr-1 rounded-full hover:bg-primary/20">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))
          )}
        </div>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs text-muted-foreground">שינויים ייכנסו לתוקף בסריקה הבאה.</p>
          <Button onClick={onSave} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {saving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}שמור
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// Mirror the registration/onboarding area-of-activity options exactly.
const GEOGRAPHIC_OPTIONS = [
  { value: 'national', label: '🇮🇱 ארצי — פעיל בכל רחבי ישראל' },
  { value: 'local', label: '🏙️ מקומי — פעיל באזור גיאוגרפי מוגדר' },
  { value: 'international', label: '🌍 בינלאומי — פעיל גם מחוץ לישראל' },
]

const WA_CANCEL_NUMBER = '972559137417'

interface CompanyData {
  name: string
  website: string
  description: string
  geographicScope: string
}

interface UserData {
  fullName: string
  email: string
  phone: string
  role: string
}

interface SubscriptionData {
  status: string
  base_amount: number | null
  final_amount: number | null
  coupon_code: string | null
  current_period_end: string | null
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  active: { label: 'פעיל', className: 'bg-green-500/10 text-green-600' },
  grace: { label: 'בתקופת חסד', className: 'bg-amber-500/10 text-amber-600' },
  pending_payment: { label: 'ממתין לתשלום', className: 'bg-amber-500/10 text-amber-600' },
  pending: { label: 'ממתין לתשלום', className: 'bg-amber-500/10 text-amber-600' },
  canceled: { label: 'בוטל', className: 'bg-red-500/10 text-red-600' },
}

export default function SettingsPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isSavingAccount, setIsSavingAccount] = useState(false)

  const [companyData, setCompanyData] = useState<CompanyData>({
    name: "",
    website: "",
    description: "",
    geographicScope: "national",
  })

  const [userData, setUserData] = useState<UserData>({
    fullName: "",
    email: "",
    phone: "",
    role: "",
  })

  const [subscription, setSubscription] = useState<SubscriptionData | null>(null)

  const { toast } = useToast()

  const [keywords, setKeywords] = useState<string[]>([])
  const [newKeyword, setNewKeyword] = useState("")
  // GEO presence-check questions. Clients may DELETE individual questions (no
  // add/edit) — the next GEO scan tops the list back up to 3 with new questions.
  const [geoQueries, setGeoQueries] = useState<string[]>([])
  const [geoSaving, setGeoSaving] = useState(false)

  // ── business_profile fields (saved via update-business-profile deep-merge) ──
  const [directCompetitors, setDirectCompetitors] = useState<string[]>([])
  const [targetAudiences, setTargetAudiences] = useState<string[]>([])
  const [industryTags, setIndustryTags] = useState<string[]>([])
  const [geographicMarkets, setGeographicMarkets] = useState<string[]>([])
  const [competitiveAdvantage, setCompetitiveAdvantage] = useState("")
  const [productNames, setProductNames] = useState<string[]>([])
  // Keep the original product objects so a name edit preserves description/etc.
  const [productObjects, setProductObjects] = useState<any[]>([])
  // Which business_profile section is currently saving (for its spinner).
  const [bpSaving, setBpSaving] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        // Company profile
        const { data: company } = await supabase
          .from('companies')
          .select('*')
          .eq('id', user.id)
          .single()

        if (company) {
          const scope = Array.isArray(company.geographic_scope)
            ? (company.geographic_scope[0] || 'national')
            : (company.geographic_scope || 'national')
          setCompanyData({
            name: company.name || "",
            website: company.website || "",
            description: company.description || "",
            geographicScope: scope,
          })
          if (company.keywords && Array.isArray(company.keywords)) {
            setKeywords(company.keywords)
          }
          const bp = (company.business_profile as any) || {}
          if (Array.isArray(bp.geoQueries)) setGeoQueries(bp.geoQueries.filter((q: any) => typeof q === 'string'))
          if (Array.isArray(bp.directCompetitors)) setDirectCompetitors(bp.directCompetitors.filter((q: any) => typeof q === 'string'))
          if (Array.isArray(bp.targetAudiences)) setTargetAudiences(bp.targetAudiences.filter((q: any) => typeof q === 'string'))
          if (Array.isArray(bp.industryTags)) setIndustryTags(bp.industryTags.filter((q: any) => typeof q === 'string'))
          if (Array.isArray(bp.geographicMarkets)) setGeographicMarkets(bp.geographicMarkets.filter((q: any) => typeof q === 'string'))
          if (typeof bp.competitiveAdvantage === 'string') setCompetitiveAdvantage(bp.competitiveAdvantage)
          if (Array.isArray(bp.products)) {
            setProductObjects(bp.products)
            setProductNames(bp.products.map((p: any) => String(p?.name || '')).filter(Boolean))
          }
        }

        // Account — phone canonical source is companies.phone, fallback metadata.
        setUserData({
          fullName: user.user_metadata?.full_name || "",
          email: user.email || "",
          phone: company?.phone || user.user_metadata?.phone || "",
          role: user.user_metadata?.role || "",
        })

        // Current subscription
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('status, base_amount, final_amount, coupon_code, current_period_end')
          .eq('user_id', user.id)
          .maybeSingle()
        if (sub) setSubscription(sub as SubscriptionData)
      }

      setIsLoading(false)
    }

    fetchData()
  }, [])

  const saveCompanyData = async () => {
    setIsSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      await supabase
        .from('companies')
        .update({
          name: companyData.name,
          website: companyData.website,
          description: companyData.description,
          geographic_scope: [companyData.geographicScope],
        })
        .eq('id', user.id)
    }
    setIsSaving(false)
  }

  const saveAccountData = async () => {
    setIsSavingAccount(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      // Persist editable fields: name/phone/role → user_metadata, phone → companies.
      await supabase.auth.updateUser({
        data: {
          full_name: userData.fullName,
          phone: userData.phone,
          role: userData.role,
        },
      })
      await supabase
        .from('companies')
        .update({ phone: userData.phone })
        .eq('id', user.id)
    }
    setIsSavingAccount(false)
  }

  const saveKeywords = async () => {
    setIsSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      await supabase
        .from('companies')
        .update({ keywords })
        .eq('id', user.id)
    }
    setIsSaving(false)
  }

  const addKeyword = () => {
    if (newKeyword.trim() && !keywords.includes(newKeyword.trim())) {
      setKeywords([...keywords, newKeyword.trim()])
      setNewKeyword("")
    }
  }

  const removeKeyword = (keyword: string) => {
    setKeywords(keywords.filter((k) => k !== keyword))
  }

  // Client deletes a single GEO question. Persists the trimmed list immediately
  // via update-business-profile (deep-merge). The next GEO scan refills to 3.
  const deleteGeoQuery = async (index: number) => {
    const previous = geoQueries
    const updated = geoQueries.filter((_, i) => i !== index)
    setGeoQueries(updated)
    setGeoSaving(true)
    try {
      const res = await fetch('/api/update-business-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geoQueries: updated }),
      })
      if (!res.ok) setGeoQueries(previous) // revert on failure
    } catch {
      setGeoQueries(previous)
    } finally {
      setGeoSaving(false)
    }
  }

  // Save a business_profile partial via the deep-merge PATCH endpoint (same path
  // the profile page uses). `section` drives the per-card saving spinner.
  const patchProfile = async (section: string, partial: Record<string, any>) => {
    setBpSaving(section)
    try {
      const res = await fetch('/api/update-business-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.success === false) throw new Error(data?.error || 'save failed')
      toast({ title: 'נשמר בהצלחה', description: 'השינוי ייכנס לתוקף בסריקה הבאה' })
    } catch {
      toast({ title: 'שגיאה בשמירה', variant: 'destructive' })
    } finally {
      setBpSaving(null)
    }
  }

  // Products: edit the NAMES as chips while preserving each product's existing
  // description/targetAudience/priceRange (matched by name); new names → minimal
  // objects. Keeps the stored product shape intact.
  const saveProducts = async () => {
    const byName = new Map(productObjects.map((p: any) => [String(p?.name || ''), p]))
    const products = productNames.map((name) =>
      byName.get(name) || { name, description: '', targetAudience: '' }
    )
    setProductObjects(products)
    await patchProfile('products', { products })
  }

  const handleCancelSubscription = () => {
    if (!confirm("לפנות לביטול המנוי בוואטסאפ?")) return
    const msg = `שלום, אני מעוניין בביטול המנוי שלי. אימייל: ${userData.email}`
    const url = `https://wa.me/${WA_CANCEL_NUMBER}?text=${encodeURIComponent(msg)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const statusInfo = subscription
    ? (STATUS_LABELS[subscription.status] || { label: subscription.status, className: 'bg-secondary text-foreground' })
    : null
  const monthlyPrice = subscription?.base_amount ?? 79
  const renewalDate = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString('he-IL')
    : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">הגדרות</h1>
        <p className="text-muted-foreground">נהל את הגדרות החשבון והחברה</p>
      </div>

      <Tabs defaultValue="company" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 bg-secondary">
          <TabsTrigger value="company" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">פרופיל חברה</span>
          </TabsTrigger>
          <TabsTrigger value="keywords" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline">נתוני סריקה</span>
          </TabsTrigger>
          <TabsTrigger value="account" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">חשבון</span>
          </TabsTrigger>
        </TabsList>

        {/* Company Profile Tab — mirrors registration/onboarding company fields */}
        <TabsContent value="company">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground">פרטי העסק</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                המידע הבסיסי על העסק — משמש בכל הניתוחים והסריקות.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="companyName">שם החברה</Label>
                  <Input
                    id="companyName"
                    value={companyData.name}
                    onChange={(e) =>
                      setCompanyData({ ...companyData, name: e.target.value })
                    }
                    className="border-border bg-input"
                    placeholder="שם החברה שלך"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">אתר אינטרנט</Label>
                  <Input
                    id="website"
                    value={companyData.website}
                    onChange={(e) =>
                      setCompanyData({ ...companyData, website: e.target.value })
                    }
                    className="border-border bg-input"
                    dir="ltr"
                    placeholder="https://example.com"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="geographicScope">איזור פעילות</Label>
                  <Select
                    value={companyData.geographicScope}
                    onValueChange={(v) => setCompanyData({ ...companyData, geographicScope: v })}
                  >
                    <SelectTrigger id="geographicScope" className="border-border bg-input">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GEOGRAPHIC_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {companyData.geographicScope === 'international' && (
                    <p className="text-xs text-teal-600">הניתוחים יכללו גם שווקים בינלאומיים</p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">תיאור קצר</Label>
                <Textarea
                  id="description"
                  value={companyData.description}
                  onChange={(e) =>
                    setCompanyData({ ...companyData, description: e.target.value })
                  }
                  className="min-h-[100px] border-border bg-input"
                  placeholder="2-3 משפטים על מה שהעסק עושה, למי הוא מוכר ומה הוא מציע..."
                />
              </div>
              <Button
                onClick={saveCompanyData}
                disabled={isSaving}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isSaving ? (
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="ml-2 h-4 w-4" />
                )}
                שמור שינויים
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Keywords Tab */}
        <TabsContent value="keywords">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2 text-base">
                <Tag className="h-4 w-4 text-primary" />מילות מפתח למעקב
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                מילות המפתח שאנחנו עוקבים אחריהן — משפיעות על דירוג ה-SEO שלך בגוגל, זיהוי טרנדים, והתאמת מכרזים וחדשות.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="הוסף מילת מפתח חדשה"
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addKeyword()}
                  className="border-border bg-input"
                />
                <Button onClick={addKeyword} className="bg-primary text-primary-foreground">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {keywords.length === 0 ? (
                  <p className="text-sm text-muted-foreground">לא הוגדרו מילות מפתח עדיין</p>
                ) : (
                  keywords.map((keyword) => (
                    <Badge
                      key={keyword}
                      variant="secondary"
                      className="flex items-center gap-1 bg-primary/10 px-3 py-1.5 text-primary"
                    >
                      {keyword}
                      <button
                        onClick={() => removeKeyword(keyword)}
                        className="mr-1 rounded-full hover:bg-primary/20"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))
                )}
              </div>
              <Button
                onClick={saveKeywords}
                disabled={isSaving}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isSaving ? (
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="ml-2 h-4 w-4" />
                )}
                שמור שינויים
              </Button>
            </CardContent>
          </Card>

          {/* GEO queries — clients may DELETE (no add/edit); scan refills to 3 */}
          <Card className="border-border bg-card mt-6">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2 text-base">
                🌐 שאלות GEO
                {geoSaving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                השאלות שאנחנו בודקים במנועי AI (ChatGPT/Gemini) כדי לראות אם העסק שלך מומלץ. מנוהלות על ידינו; אפשר למחוק שאלה לא רלוונטית והמערכת תחליף אותה בסריקה הבאה.
              </p>
            </CardHeader>
            <CardContent>
              {geoQueries.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  השאלות יווצרו אוטומטית בסריקה הבאה.
                </p>
              ) : (
                <ul className="space-y-2">
                  {geoQueries.map((q, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground"
                    >
                      <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                      <span dir="rtl" className="flex-1">{q}</span>
                      <button
                        type="button"
                        onClick={() => deleteGeoQuery(i)}
                        disabled={geoSaving}
                        aria-label="מחק שאלה"
                        title="מחק שאלה"
                        className="shrink-0 text-muted-foreground hover:text-red-500 disabled:opacity-50 transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* D. מתחרים ישירים */}
          <div className="mt-6">
            <ChipEditor
              icon={Target}
              title="מתחרים ישירים"
              explanation="המתחרים שאתה רוצה שנעקוב אחריהם — משפיע על גילוי וניתוח המתחרים."
              items={directCompetitors}
              onItemsChange={setDirectCompetitors}
              onSave={() => patchProfile('competitors', { directCompetitors })}
              saving={bpSaving === 'competitors'}
              placeholder="הוסף שם מתחרה"
            />
          </div>

          {/* E. קהל יעד */}
          <div className="mt-6">
            <ChipEditor
              icon={Users}
              title="קהל יעד"
              explanation="מי הלקוחות שלך — עוזר לנו למצוא לידים, חדשות וכנסים רלוונטיים."
              items={targetAudiences}
              onItemsChange={setTargetAudiences}
              onSave={() => patchProfile('audiences', { targetAudiences })}
              saving={bpSaving === 'audiences'}
              placeholder="הוסף קהל יעד"
            />
          </div>

          {/* F. תחום ותגיות (industryTags + geographicMarkets) */}
          <div className="mt-6">
            <ChipEditor
              icon={Tag}
              title="תגיות תעשייה"
              explanation="התחום שלך — משפיע על כנסים, מכרזים וניתוח מתחרים."
              items={industryTags}
              onItemsChange={setIndustryTags}
              onSave={() => patchProfile('industry', { industryTags })}
              saving={bpSaving === 'industry'}
              placeholder="הוסף תגית תעשייה"
            />
          </div>
          <div className="mt-6">
            <ChipEditor
              icon={Building2}
              title="שווקים גיאוגרפיים"
              explanation="האזורים שבהם אתה פעיל — משפיע על כנסים, מכרזים וחדשות רלוונטיים."
              items={geographicMarkets}
              onItemsChange={setGeographicMarkets}
              onSave={() => patchProfile('geo', { geographicMarkets })}
              saving={bpSaving === 'geo'}
              placeholder="הוסף שוק גיאוגרפי"
            />
          </div>

          {/* G. יתרון תחרותי + מוצרים/שירותים */}
          <Card className="border-border bg-card mt-6">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2 text-base">
                <Trophy className="h-4 w-4 text-primary" />יתרון תחרותי
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                מה מייחד אותך מהמתחרים — משמש בהמלצות ובזיהוי הזדמנויות.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={competitiveAdvantage}
                onChange={(e) => setCompetitiveAdvantage(e.target.value)}
                className="min-h-[90px] border-border bg-input"
                placeholder="לדוגמה: משלוח חינם, ייצור בישראל, שירות אישי..."
              />
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-xs text-muted-foreground">שינויים ייכנסו לתוקף בסריקה הבאה.</p>
                <Button
                  onClick={() => patchProfile('advantage', { competitiveAdvantage })}
                  disabled={bpSaving === 'advantage'}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {bpSaving === 'advantage' ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}שמור
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="mt-6">
            <ChipEditor
              icon={Sparkles}
              title="מוצרים ושירותים"
              explanation="מה אתה מציע — משמש בהמלצות ובזיהוי הזדמנויות. (עריכה מפורטת זמינה בעמוד הפרופיל)"
              items={productNames}
              onItemsChange={setProductNames}
              onSave={saveProducts}
              saving={bpSaving === 'products'}
              placeholder="הוסף מוצר/שירות"
            />
          </div>
        </TabsContent>

        {/* Account Tab */}
        <TabsContent value="account">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground">פרטי חשבון</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fullName">שם מלא</Label>
                  <Input
                    id="fullName"
                    value={userData.fullName}
                    onChange={(e) => setUserData({ ...userData, fullName: e.target.value })}
                    className="border-border bg-input"
                    placeholder="הזן שם מלא"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">אימייל</Label>
                  <Input
                    id="email"
                    type="email"
                    value={userData.email}
                    disabled
                    className="border-border bg-input opacity-60"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">טלפון</Label>
                  <Input
                    id="phone"
                    value={userData.phone}
                    onChange={(e) => setUserData({ ...userData, phone: e.target.value })}
                    className="border-border bg-input"
                    dir="ltr"
                    placeholder="0501234567"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">תפקיד</Label>
                  <Input
                    id="role"
                    value={userData.role}
                    onChange={(e) => setUserData({ ...userData, role: e.target.value })}
                    className="border-border bg-input"
                    placeholder="לדוגמה: מנכ״ל / בעלים"
                  />
                </div>
              </div>

              <Button
                onClick={saveAccountData}
                disabled={isSavingAccount}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isSavingAccount ? (
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="ml-2 h-4 w-4" />
                )}
                שמור שינויים
              </Button>

              {/* Current subscription */}
              <div className="space-y-2 pt-4 border-t border-border">
                <Label>המנוי שלי</Label>
                <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">North Star Radar — מנוי חודשי</p>
                      <p className="text-sm text-muted-foreground">{monthlyPrice} ₪ / חודש</p>
                    </div>
                    {statusInfo ? (
                      <Badge className={statusInfo.className}>{statusInfo.label}</Badge>
                    ) : (
                      <Badge className="bg-secondary text-muted-foreground">אין מנוי פעיל</Badge>
                    )}
                  </div>

                  {renewalDate && (
                    <p className="text-sm text-muted-foreground">
                      חידוש הבא: <span className="text-foreground">{renewalDate}</span>
                    </p>
                  )}

                  <Button
                    variant="outline"
                    onClick={handleCancelSubscription}
                    className="gap-2 border-red-500/30 text-red-600 hover:bg-red-500/10 hover:text-red-600"
                  >
                    <MessageCircle className="h-4 w-4" />
                    ביטול מנוי
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
