"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
  Building2,
  Save,
  Loader2,
  Star,
  RefreshCw,
  Sparkles,
  X,
  Plus,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

const industries = [
  "טכנולוגיה", "פינטק", "סייבר", "בריאות דיגיטלית", "מסחר אלקטרוני",
  "SaaS", "תוכנה", "שירותים עסקיים", "ייצור", "נדל\"ן",
  "חינוך", "תחבורה", "אנרגיה", "מזון ומשקאות", "אחר",
]

const companySizes = [
  "1-10 עובדים", "11-50 עובדים", "51-200 עובדים", "201-500 עובדים", "500+ עובדים",
]

const geographicAreaOptions = [
  "תל אביב והמרכז", "ירושלים", "חיפה והצפון", "באר שבע והדרום",
  "השרון", "שפלה", "כל הארץ", "בינלאומי",
]

const targetCustomerOptions = [
  "עסקים קטנים (SMB)", "עסקים בינוניים (Mid-Market)", "ארגונים גדולים (Enterprise)",
  "ממשלה וציבורי", "צרכנים פרטיים (B2C)", "סטארטאפים", "מוסדות חינוך", "מוסדות בריאות",
]

interface CompanyData {
  name: string
  website: string
  industry: string
  city: string
  size: string
  description: string
  keywords: string[]
  geographic_area: string[]
  target_customers: string[]
}

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
  message?: string
  error?: string
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generatingSwot, setGeneratingSwot] = useState(false)
  const [loadingPlaces, setLoadingPlaces] = useState(false)
  const [newKeyword, setNewKeyword] = useState("")

  const [company, setCompany] = useState<CompanyData>({
    name: "", website: "", industry: "", city: "", size: "", description: "",
    keywords: [], geographic_area: [], target_customers: [],
  })
  const [swot, setSwot] = useState<SwotData | null>(null)
  const [places, setPlaces] = useState<PlacesData | null>(null)

  const supabase = createClient()
  const { toast } = useToast()

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('companies')
      .select('name, website, industry, city, size, description, keywords, geographic_area, target_customers, swot')
      .eq('id', user.id)
      .single()

    if (data) {
      setCompany({
        name: data.name || '',
        website: data.website || '',
        industry: data.industry || '',
        city: data.city || '',
        size: data.size || '',
        description: data.description || '',
        keywords: data.keywords || [],
        geographic_area: data.geographic_area || [],
        target_customers: data.target_customers || [],
      })
      if (data.swot && Object.keys(data.swot).length > 0) {
        setSwot(data.swot as SwotData)
      }
    }
    setLoading(false)
  }

  async function saveProfile() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const { error } = await supabase
      .from('companies')
      .update({
        name: company.name,
        website: company.website,
        industry: company.industry,
        city: company.city,
        size: company.size,
        description: company.description,
        keywords: company.keywords,
        geographic_area: company.geographic_area,
        target_customers: company.target_customers,
      })
      .eq('id', user.id)

    setSaving(false)
    if (error) {
      toast({ title: "שגיאה בשמירה", description: error.message, variant: "destructive" })
    } else {
      toast({ title: "הפרופיל נשמר בהצלחה" })
    }
  }

  async function generateSwot() {
    setGeneratingSwot(true)
    try {
      const res = await fetch('/api/generate-swot', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setSwot(data.swot)
        toast({ title: "ניתוח SWOT נוצר בהצלחה" })
      } else {
        toast({ title: "שגיאה", description: data.error || "לא הצלחנו ליצור ניתוח", variant: "destructive" })
      }
    } catch {
      toast({ title: "שגיאה", description: "אירעה שגיאה", variant: "destructive" })
    } finally {
      setGeneratingSwot(false)
    }
  }

  async function loadPlaces() {
    setLoadingPlaces(true)
    try {
      const res = await fetch('/api/google-places')
      const data = await res.json()
      setPlaces(data)
    } catch {
      setPlaces({ rating: null, reviewCount: 0, reviews: [], error: 'שגיאה בטעינת נתוני Google' })
    } finally {
      setLoadingPlaces(false)
    }
  }

  const toggleMultiSelect = (field: 'geographic_area' | 'target_customers', value: string) => {
    const current = company[field]
    const updated = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value]
    setCompany({ ...company, [field]: updated })
  }

  const addKeyword = () => {
    if (newKeyword.trim() && !company.keywords.includes(newKeyword.trim())) {
      setCompany({ ...company, keywords: [...company.keywords, newKeyword.trim()] })
      setNewKeyword("")
    }
  }

  const removeKeyword = (kw: string) => {
    setCompany({ ...company, keywords: company.keywords.filter(k => k !== kw) })
  }

  function StarRating({ rating }: { rating: number }) {
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map(i => (
          <Star
            key={i}
            className={`h-4 w-4 ${i <= Math.round(rating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
          />
        ))}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">פרופיל עסקי</h1>
        <p className="text-muted-foreground">נתוני הפרופיל משמשים את כל מודולי המערכת לתוצאות מדויקות</p>
      </div>

      {/* Section 1: Company Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            פרטי החברה
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Basic fields */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>שם החברה</Label>
              <Input
                value={company.name}
                onChange={e => setCompany({ ...company, name: e.target.value })}
                placeholder="שם החברה"
              />
            </div>
            <div className="space-y-2">
              <Label>אתר אינטרנט</Label>
              <Input
                value={company.website}
                onChange={e => setCompany({ ...company, website: e.target.value })}
                placeholder="https://example.co.il"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label>תחום עיסוק</Label>
              <Select value={company.industry} onValueChange={v => setCompany({ ...company, industry: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="בחר תחום" />
                </SelectTrigger>
                <SelectContent>
                  {industries.map(ind => (
                    <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>עיר</Label>
              <Input
                value={company.city}
                onChange={e => setCompany({ ...company, city: e.target.value })}
                placeholder="תל אביב"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>גודל חברה</Label>
              <Select value={company.size} onValueChange={v => setCompany({ ...company, size: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="בחר גודל" />
                </SelectTrigger>
                <SelectContent>
                  {companySizes.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>תיאור מוצרים / שירותים</Label>
              <Textarea
                value={company.description}
                onChange={e => setCompany({ ...company, description: e.target.value })}
                placeholder="תאר את המוצרים או השירותים שהחברה מציעה..."
                className="min-h-[80px]"
              />
            </div>
          </div>

          {/* Keywords */}
          <div className="space-y-3">
            <Label>מילות מפתח</Label>
            <div className="flex gap-2">
              <Input
                value={newKeyword}
                onChange={e => setNewKeyword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addKeyword()}
                placeholder="הוסף מילת מפתח..."
              />
              <Button type="button" variant="outline" onClick={addKeyword} disabled={!newKeyword.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {company.keywords.map(kw => (
                <Badge key={kw} variant="secondary" className="gap-1 py-1">
                  {kw}
                  <button onClick={() => removeKeyword(kw)}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {company.keywords.length === 0 && (
                <p className="text-sm text-muted-foreground">אין מילות מפתח</p>
              )}
            </div>
          </div>

          {/* Geographic Area */}
          <div className="space-y-3">
            <Label>אזור גיאוגרפי (ניתן לבחור כמה)</Label>
            <div className="flex flex-wrap gap-2">
              {geographicAreaOptions.map(area => (
                <button
                  key={area}
                  type="button"
                  onClick={() => toggleMultiSelect('geographic_area', area)}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                    company.geographic_area.includes(area)
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  {area}
                </button>
              ))}
            </div>
          </div>

          {/* Target Customers */}
          <div className="space-y-3">
            <Label>לקוחות יעד (ניתן לבחור כמה)</Label>
            <div className="flex flex-wrap gap-2">
              {targetCustomerOptions.map(tc => (
                <button
                  key={tc}
                  type="button"
                  onClick={() => toggleMultiSelect('target_customers', tc)}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                    company.target_customers.includes(tc)
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  {tc}
                </button>
              ))}
            </div>
          </div>

          <Button onClick={saveProfile} disabled={saving}>
            {saving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}
            שמור פרופיל
          </Button>
        </CardContent>
      </Card>

      {/* Section 2: Google Places */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-500" />
            דירוג Google
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!places ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <p className="text-sm text-muted-foreground">טען את הדירוג והביקורות מ-Google</p>
              <Button variant="outline" onClick={loadPlaces} disabled={loadingPlaces}>
                {loadingPlaces ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <RefreshCw className="ml-2 h-4 w-4" />}
                טען מ-Google
              </Button>
            </div>
          ) : places.error && !places.rating ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <p className="text-sm text-muted-foreground">
                {places.error === 'GOOGLE_PLACES_API_KEY not set'
                  ? 'מפתח GOOGLE_PLACES_API_KEY לא מוגדר בסביבה'
                  : places.message || places.error}
              </p>
              <Button variant="outline" size="sm" onClick={loadPlaces} disabled={loadingPlaces}>
                <RefreshCw className="ml-1 h-3.5 w-3.5" />
                נסה שוב
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Rating summary */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {places.rating ? (
                    <>
                      <span className="text-3xl font-bold">{places.rating.toFixed(1)}</span>
                      <div>
                        <StarRating rating={places.rating} />
                        <p className="text-xs text-muted-foreground mt-1">{places.reviewCount} ביקורות</p>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">{places.message || 'לא נמצאו נתונים'}</p>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={loadPlaces} disabled={loadingPlaces}>
                  <RefreshCw className={`h-4 w-4 ${loadingPlaces ? 'animate-spin' : ''}`} />
                </Button>
              </div>

              {/* Recent reviews */}
              {places.reviews.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-medium">ביקורות אחרונות</p>
                  {places.reviews.map((review, i) => (
                    <div key={i} className="rounded-lg border bg-muted/30 p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{review.author}</span>
                        <div className="flex items-center gap-1">
                          <StarRating rating={review.rating} />
                          <span className="text-xs text-muted-foreground">{review.time}</span>
                        </div>
                      </div>
                      {review.text && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{review.text}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3: SWOT Analysis */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              ניתוח SWOT
            </CardTitle>
            <Button onClick={generateSwot} disabled={generatingSwot} variant="outline" size="sm">
              {generatingSwot
                ? <><Loader2 className="ml-2 h-4 w-4 animate-spin" />מנתח...</>
                : <><Sparkles className="ml-2 h-4 w-4" />{swot ? 'עדכן ניתוח' : 'צור ניתוח AI'}</>
              }
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!swot ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <p className="text-sm text-muted-foreground">לחץ על "צור ניתוח AI" לקבלת ניתוח SWOT מותאם לעסק שלך</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {/* Strengths */}
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <h3 className="mb-3 flex items-center gap-2 font-semibold text-green-800">
                  <TrendingUp className="h-4 w-4" />
                  חוזקות
                </h3>
                <ul className="space-y-1.5">
                  {swot.strengths.map((s, i) => (
                    <li key={i} className="text-sm text-green-700 flex items-start gap-2">
                      <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Weaknesses */}
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <h3 className="mb-3 flex items-center gap-2 font-semibold text-red-800">
                  <TrendingDown className="h-4 w-4" />
                  חולשות
                </h3>
                <ul className="space-y-1.5">
                  {swot.weaknesses.map((w, i) => (
                    <li key={i} className="text-sm text-red-700 flex items-start gap-2">
                      <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                      {w}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Opportunities */}
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <h3 className="mb-3 flex items-center gap-2 font-semibold text-blue-800">
                  <Plus className="h-4 w-4" />
                  הזדמנויות
                </h3>
                <ul className="space-y-1.5">
                  {swot.opportunities.map((o, i) => (
                    <li key={i} className="text-sm text-blue-700 flex items-start gap-2">
                      <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                      {o}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Threats */}
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                <h3 className="mb-3 flex items-center gap-2 font-semibold text-yellow-800">
                  <Minus className="h-4 w-4" />
                  איומים
                </h3>
                <ul className="space-y-1.5">
                  {swot.threats.map((t, i) => (
                    <li key={i} className="text-sm text-yellow-800 flex items-start gap-2">
                      <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-500" />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
