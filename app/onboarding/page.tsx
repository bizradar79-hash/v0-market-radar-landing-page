"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Radar, Building2, Users, Tag, Settings, ChevronLeft, ChevronRight, Check, Plus, X, Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { createClient } from "@/lib/supabase/client"

const steps = [
  { id: 1, title: "פרטי החברה", icon: Building2 },
  { id: 2, title: "מתחרים", icon: Users },
  { id: 3, title: "מילות מפתח", icon: Tag },
  { id: 4, title: "בחר מודולים", icon: Settings },
]

const industries = [
  "טכנולוגיה",
  "פינטק",
  "סייבר",
  "בריאות דיגיטלית",
  "מסחר אלקטרוני",
  "SaaS",
  "תוכנה",
  "שירותים עסקיים",
  "ייצור",
  "נדל\"ן",
  "חינוך",
  "תחבורה",
  "אנרגיה",
  "מזון ומשקאות",
  "קמעונאות",
  "דפוס והפקה",
  "שיווק ופרסום",
  "בנייה ותשתיות",
  "תיירות ואירוח",
  "בריאות ורפואה",
  "חקלאות",
  "לוגיסטיקה",
  "פארמה",
  "ביטוח",
  "פינאנס",
  "משפטים",
  "ספורט ופנאי",
  "אחר",
]

const companySizes = [
  "1-10 עובדים",
  "11-50 עובדים",
  "51-200 עובדים",
  "201-500 עובדים",
  "500+ עובדים",
]

const modules = [
  { id: "competitors", label: "מתחרים", description: "מעקב אחר פעילות מתחרים" },
  { id: "leads", label: "לידים", description: "גילוי לידים חדשים" },
  { id: "tenders", label: "מכרזים", description: "התראות על מכרזים רלוונטיים" },
  { id: "trends", label: "טרנדים", description: "זיהוי מגמות בשוק" },
  { id: "news", label: "חדשות", description: "חדשות רלוונטיות לעסק" },
  { id: "conferences", label: "כנסים", description: "כנסים ואירועים מקצועיים" },
]

const SCAN_STEPS = [
  { label: 'מנתח פרופיל עסקי...', route: '/api/generate-overview' },
  { label: 'מייצר ניתוח SWOT...', route: '/api/generate-swot' },
  { label: 'מגלה מתחרים...', route: '/api/find-competitors' },
  { label: 'מגלה לידים...', route: '/api/generate-leads' },
  { label: 'מחפש מכרזים...', route: '/api/generate-tenders' },
  { label: 'מחפש חדשות...', route: '/api/generate-news' },
  { label: 'מחפש כנסים...', route: '/api/generate-conferences' },
  { label: 'מנתח טרנדים...', route: '/api/generate-trends' },
]

interface Competitor {
  name: string
  website: string
}

export default function OnboardingPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isFindingCompetitors, setIsFindingCompetitors] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [scanStep, setScanStep] = useState(0)
  
  // Step 1 - Company Details
  const [companyName, setCompanyName] = useState("")
  const [website, setWebsite] = useState("")
  const [industry, setIndustry] = useState("")
  const [city, setCity] = useState("")
  const [companySize, setCompanySize] = useState("")
  const [description, setDescription] = useState("")
  
  // Step 2 - Competitors
  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [newCompetitorName, setNewCompetitorName] = useState("")
  const [newCompetitorWebsite, setNewCompetitorWebsite] = useState("")
  const [aiCompetitors, setAiCompetitors] = useState<Array<{ name: string; website: string; reason: string; similarity: number; selected: boolean }>>([])
  const [competitorError, setCompetitorError] = useState<string | null>(null)
  
  // Step 3 - Keywords
  const [keywords, setKeywords] = useState<string[]>([])
  const [industriesTags, setIndustriesTags] = useState<string[]>([])
  const [productsTags, setProductsTags] = useState<string[]>([])
  const [newKeyword, setNewKeyword] = useState("")
  const [newIndustry, setNewIndustry] = useState("")
  const [newProduct, setNewProduct] = useState("")
  
  // Step 4 - Modules
  const [selectedModules, setSelectedModules] = useState<Record<string, boolean>>({
    competitors: true,
    leads: true,
    tenders: true,
    trends: true,
    news: true,
    conferences: true,
  })

  // Industry "אחר" free text
  const [industryCustom, setIndustryCustom] = useState("")
  const effectiveIndustry = industry === 'אחר' ? industryCustom.trim() : industry

  const addCompetitor = () => {
    if (newCompetitorName.trim()) {
      setCompetitors([...competitors, { name: newCompetitorName.trim(), website: newCompetitorWebsite.trim() }])
      setNewCompetitorName("")
      setNewCompetitorWebsite("")
    }
  }

  const removeCompetitor = (index: number) => {
    setCompetitors(competitors.filter((_, i) => i !== index))
  }

  const findCompetitorsAuto = async () => {
    setIsFindingCompetitors(true)
    setCompetitorError(null)
    setAiCompetitors([])
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch("/api/find-competitors", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { "Authorization": `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ industry, description, city, website }),
      })
      const data = await response.json()
      if (data.success && data.competitors) {
        // Show AI results as selectable cards
        setAiCompetitors(data.competitors.map((c: { name: string; website: string; reason: string; similarity: number }) => ({
          ...c,
          selected: true, // default selected
        })))
      } else {
        setCompetitorError(data.error || "לא הצלחנו למצוא מתחרים, נסה שנית")
      }
    } catch (error) {
      console.error("Error finding competitors:", error)
      setCompetitorError("לא הצלחנו למצוא מתחרים, נסה שנית")
    } finally {
      setIsFindingCompetitors(false)
    }
  }

  const addSelectedCompetitors = () => {
    const selected = aiCompetitors.filter(c => c.selected)
    setCompetitors([...competitors, ...selected.map(c => ({ name: c.name, website: c.website }))])
    setAiCompetitors([])
  }

  const toggleAiCompetitor = (index: number) => {
    setAiCompetitors(prev => prev.map((c, i) => i === index ? { ...c, selected: !c.selected } : c))
  }

  const addTag = (type: "keyword" | "industry" | "product") => {
    if (type === "keyword" && newKeyword.trim()) {
      setKeywords([...keywords, newKeyword.trim()])
      setNewKeyword("")
    } else if (type === "industry" && newIndustry.trim()) {
      setIndustriesTags([...industriesTags, newIndustry.trim()])
      setNewIndustry("")
    } else if (type === "product" && newProduct.trim()) {
      setProductsTags([...productsTags, newProduct.trim()])
      setNewProduct("")
    }
  }

  const removeTag = (type: "keyword" | "industry" | "product", index: number) => {
    if (type === "keyword") {
      setKeywords(keywords.filter((_, i) => i !== index))
    } else if (type === "industry") {
      setIndustriesTags(industriesTags.filter((_, i) => i !== index))
    } else if (type === "product") {
      setProductsTags(productsTags.filter((_, i) => i !== index))
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent, type: "keyword" | "industry" | "product") => {
    if (e.key === "Enter") {
      e.preventDefault()
      addTag(type)
    }
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setError(null)
    
    try {
      const supabase = createClient()
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      
      console.log("[v0] Onboarding submit - user:", user?.id, "error:", userError)
      
      if (userError || !user) {
        console.log("[v0] No authenticated user, redirecting to login")
        router.push("/login")
        return
      }

      // Step 1: Save company profile
      const companyData = {
        id: user.id,
        name: companyName,
        website,
        industry: effectiveIndustry,
        city,
        size: companySize,
        description,
        competitors: competitors.map(c => ({ name: c.name, website: c.website })),
        keywords: [...keywords, ...industriesTags, ...productsTags],
        modules: Object.entries(selectedModules)
          .filter(([, enabled]) => enabled)
          .map(([id]) => id),
        onboarding_completed: true,
      }
      
      console.log("[v0] Saving company data:", companyData)
      
      const { data: companyResult, error: companyError } = await supabase.from("companies").upsert(companyData).select()
      
      console.log("[v0] Company save result:", companyResult, "error:", companyError)

      if (companyError) {
        setError(`שגיאה בשמירת נתוני החברה: ${companyError.message}`)
        throw companyError
      }

      // Insert manually-added competitors — always preserved, never overwritten by AI scan
      if (competitors.length > 0) {
        const competitorRecords = competitors.map(c => ({
          company_id: user.id,
          name: c.name,
          website: c.website,
          services: industry,
          positioning: "מתחרה ישיר",
          threat_score: Math.floor(Math.random() * 30) + 50,
          trend: "stable",
          source: "manual",
        }))
        await supabase.from("competitors").insert(competitorRecords)
      }

      // Welcome alert
      await supabase.from("alerts").insert({
        company_id: user.id,
        title: "ברוך הבא ל-Market Radar!",
        message: "החשבון שלך מוכן. התחל לגלות הזדמנויות עסקיות חדשות.",
        type: "success",
        is_read: false,
      })

      // Start sequential AI scan
      const { data: { session } } = await supabase.auth.getSession()
      const authHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
      }

      setIsSubmitting(false)
      setIsScanning(true)

      for (let i = 0; i < SCAN_STEPS.length; i++) {
        setScanStep(i)
        try {
          await fetch(SCAN_STEPS[i].route, { method: 'POST', headers: authHeaders })
        } catch {
          // ignore errors, continue to next step
        }
      }

      router.push("/app/dashboard")
    } catch (error: unknown) {
      console.error("[v0] Error saving onboarding data:", error)
      if (error instanceof Error) {
        setError(`שגיאה בשמירת הנתונים: ${error.message}`)
      } else {
        setError("שגיאה בלתי צפויה, נסה שוב")
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const canProceed = () => {
    if (currentStep === 1) {
      return companyName.trim() !== "" && !!effectiveIndustry
    }
    return true
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Background Effects */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute right-1/4 top-0 h-[600px] w-[600px] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-0 left-1/4 h-[400px] w-[400px] rounded-full bg-primary/3 blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-3xl px-4 py-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-4 flex items-center justify-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Radar className="h-6 w-6 text-primary" />
            </div>
            <span className="text-xl font-bold text-foreground">Market Radar</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">הגדרת החשבון</h1>
          <p className="mt-2 text-muted-foreground">מלא את הפרטים כדי להתאים את המערכת לצרכים שלך</p>
          {error && (
            <div className="mt-4 rounded-lg bg-destructive/10 p-4 text-destructive text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => {
              const Icon = step.icon
              const isActive = currentStep === step.id
              const isCompleted = currentStep > step.id
              
              return (
                <div key={step.id} className="flex flex-1 items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors ${
                        isCompleted
                          ? "border-primary bg-primary text-primary-foreground"
                          : isActive
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card text-muted-foreground"
                      }`}
                    >
                      {isCompleted ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                    </div>
                    <span
                      className={`mt-2 hidden text-xs font-medium sm:block ${
                        isActive || isCompleted ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {step.title}
                    </span>
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className={`mx-2 h-0.5 flex-1 transition-colors ${
                        currentStep > step.id ? "bg-primary" : "bg-border"
                      }`}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Step Content */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-lg">
          {isScanning ? (
            <div className="space-y-6">
              <div className="text-center">
                <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
                <h2 className="mt-4 text-xl font-semibold text-foreground">סורק ומאתחל נתונים...</h2>
                <p className="mt-1 text-muted-foreground">אנא המתן, זה עשוי לקחת כדקה</p>
              </div>
              <div className="space-y-2">
                {SCAN_STEPS.map((step, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
                    <div className="shrink-0">
                      {i < scanStep
                        ? <Check className="h-5 w-5 text-primary" />
                        : i === scanStep
                        ? <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        : <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
                      }
                    </div>
                    <span className={`text-sm ${i < scanStep ? 'text-muted-foreground' : i === scanStep ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                      ({i + 1}/8) {step.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
          <>
          {/* Step 1 - Company Details */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-foreground">פרטי החברה</h2>
                <p className="mt-1 text-sm text-muted-foreground">ספר לנו על העסק שלך</p>
              </div>
              
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="companyName">שם חברה *</Label>
                  <Input
                    id="companyName"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="שם החברה שלך"
                    className="bg-background"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="website">אתר אינטרנט</Label>
                  <Input
                    id="website"
                    type="url"
                    dir="ltr"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://example.com"
                    className="bg-background text-left"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="industry">תעשייה *</Label>
                  <Select value={industry} onValueChange={(v) => { setIndustry(v); if (v !== 'אחר') setIndustryCustom("") }}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="בחר תעשייה" />
                    </SelectTrigger>
                    <SelectContent>
                      {industries.map((ind) => (
                        <SelectItem key={ind} value={ind}>
                          {ind}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {industry === 'אחר' && (
                    <Input
                      value={industryCustom}
                      onChange={(e) => setIndustryCustom(e.target.value)}
                      placeholder="פרט את תחום העסק..."
                      className="bg-background mt-2"
                    />
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="city">עיר</Label>
                  <Input
                    id="city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="תל אביב"
                    className="bg-background"
                  />
                </div>
                
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="companySize">גודל חברה</Label>
                  <Select value={companySize} onValueChange={setCompanySize}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="בחר גודל" />
                    </SelectTrigger>
                    <SelectContent>
                      {companySizes.map((size) => (
                        <SelectItem key={size} value={size}>
                          {size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="description">תיאור מוצרים/שירותים</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="תאר את המוצרים או השירותים שהחברה מציעה..."
                    className="min-h-[100px] bg-background"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 2 - Competitors */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-foreground">מתחרים</h2>
                <p className="mt-1 text-sm text-muted-foreground">הוסף מתחרים למעקב</p>
              </div>

              {/* Auto-find button */}
              <Button
                type="button"
                variant="outline"
                onClick={findCompetitorsAuto}
                disabled={isFindingCompetitors || !companyName}
                className="w-full border-primary/50 text-primary hover:bg-primary/10"
              >
                {isFindingCompetitors ? (
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="ml-2 h-4 w-4" />
                )}
                {isFindingCompetitors ? "מחפש מתחרים..." : "מצא מתחרים אוטומטית"}
              </Button>

              {/* Error message */}
              {competitorError && (
                <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  {competitorError}
                </div>
              )}

              {/* AI Competitor Results */}
              {aiCompetitors.length > 0 && (
                <div className="space-y-3">
                  <Label>תוצאות AI - בחר מתחרים להוספה</Label>
                  <div className="grid gap-3 md:grid-cols-2">
                    {aiCompetitors.map((competitor, index) => (
                      <div
                        key={index}
                        onClick={() => toggleAiCompetitor(index)}
                        className={`cursor-pointer rounded-lg border p-4 transition-all ${
                          competitor.selected
                            ? "border-primary bg-primary/5"
                            : "border-border bg-background opacity-60"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-foreground">{competitor.name}</span>
                              <Badge variant="outline" className="bg-primary/10 text-primary text-xs">
                                {competitor.similarity}% דמיון
                              </Badge>
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground" dir="ltr">
                              {competitor.website}
                            </p>
                            <p className="mt-2 text-sm text-muted-foreground">
                              {competitor.reason}
                            </p>
                          </div>
                          <div className={`flex h-5 w-5 items-center justify-center rounded border ${
                            competitor.selected 
                              ? "border-primary bg-primary text-primary-foreground" 
                              : "border-muted-foreground"
                          }`}>
                            {competitor.selected && <Check className="h-3 w-3" />}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    onClick={addSelectedCompetitors}
                    disabled={!aiCompetitors.some(c => c.selected)}
                    className="w-full"
                  >
                    <Plus className="ml-2 h-4 w-4" />
                    הוסף {aiCompetitors.filter(c => c.selected).length} מתחרים נבחרים
                  </Button>
                </div>
              )}

              {/* Add competitor form */}
              <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4 sm:flex-row">
                <div className="flex-1">
                  <Input
                    value={newCompetitorName}
                    onChange={(e) => setNewCompetitorName(e.target.value)}
                    placeholder="שם המתחרה"
                    className="bg-card"
                  />
                </div>
                <div className="flex-1">
                  <Input
                    type="url"
                    dir="ltr"
                    value={newCompetitorWebsite}
                    onChange={(e) => setNewCompetitorWebsite(e.target.value)}
                    placeholder="https://competitor.com"
                    className="bg-card text-left"
                  />
                </div>
                <Button type="button" onClick={addCompetitor} disabled={!newCompetitorName.trim()}>
                  <Plus className="ml-1 h-4 w-4" />
                  הוסף
                </Button>
              </div>

              {/* Competitors list */}
              {competitors.length > 0 && (
                <div className="space-y-2">
                  <Label>מתחרים שנוספו ({competitors.length})</Label>
                  <div className="space-y-2">
                    {competitors.map((competitor, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between rounded-lg border border-border bg-background p-3"
                      >
                        <div>
                          <span className="font-medium text-foreground">{competitor.name}</span>
                          {competitor.website && (
                            <span className="mr-2 text-sm text-muted-foreground" dir="ltr">
                              {competitor.website}
                            </span>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeCompetitor(index)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {competitors.length === 0 && (
                <div className="rounded-lg border border-dashed border-border p-8 text-center">
                  <Users className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-2 text-muted-foreground">עדיין לא נוספו מתחרים</p>
                  <p className="text-sm text-muted-foreground">{"הוסף מתחרים ידנית או לחץ על \"מצא מתחרים אוטומטית\""}</p>
                </div>
              )}
            </div>
          )}

          {/* Step 3 - Keywords */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-foreground">מילות מפתח</h2>
                <p className="mt-1 text-sm text-muted-foreground">הגדר מילות מפתח למעקב</p>
              </div>

              {/* Keywords */}
              <div className="space-y-3">
                <Label>מילות מפתח למעקב</Label>
                <div className="flex gap-2">
                  <Input
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, "keyword")}
                    placeholder="הוסף מילת מפתח..."
                    className="bg-background"
                  />
                  <Button type="button" onClick={() => addTag("keyword")} disabled={!newKeyword.trim()}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {keywords.map((keyword, index) => (
                    <Badge key={index} variant="secondary" className="gap-1 py-1.5">
                      {keyword}
                      <button type="button" onClick={() => removeTag("keyword", index)}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Industries */}
              <div className="space-y-3">
                <Label>תעשיות</Label>
                <div className="flex gap-2">
                  <Input
                    value={newIndustry}
                    onChange={(e) => setNewIndustry(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, "industry")}
                    placeholder="הוסף תעשייה..."
                    className="bg-background"
                  />
                  <Button type="button" onClick={() => addTag("industry")} disabled={!newIndustry.trim()}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {industriesTags.map((ind, index) => (
                    <Badge key={index} variant="secondary" className="gap-1 py-1.5">
                      {ind}
                      <button type="button" onClick={() => removeTag("industry", index)}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Products/Services */}
              <div className="space-y-3">
                <Label>מוצרים/שירותים</Label>
                <div className="flex gap-2">
                  <Input
                    value={newProduct}
                    onChange={(e) => setNewProduct(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, "product")}
                    placeholder="הוסף מוצר או שירות..."
                    className="bg-background"
                  />
                  <Button type="button" onClick={() => addTag("product")} disabled={!newProduct.trim()}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {productsTags.map((product, index) => (
                    <Badge key={index} variant="secondary" className="gap-1 py-1.5">
                      {product}
                      <button type="button" onClick={() => removeTag("product", index)}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 4 - Modules */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-foreground">בחר מודולים</h2>
                <p className="mt-1 text-sm text-muted-foreground">בחר אילו מודולים להפעיל</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {modules.map((module) => (
                  <label
                    key={module.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
                      selectedModules[module.id]
                        ? "border-primary bg-primary/5"
                        : "border-border bg-background hover:border-primary/50"
                    }`}
                  >
                    <Checkbox
                      checked={selectedModules[module.id]}
                      onCheckedChange={(checked) =>
                        setSelectedModules({ ...selectedModules, [module.id]: checked as boolean })
                      }
                      className="mt-0.5"
                    />
                    <div>
                      <span className="font-medium text-foreground">{module.label}</span>
                      <p className="text-sm text-muted-foreground">{module.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="mt-8 flex items-center justify-between border-t border-border pt-6">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setCurrentStep(currentStep - 1)}
              disabled={currentStep === 1}
            >
              <ChevronRight className="ml-1 h-4 w-4" />
              הקודם
            </Button>

            {currentStep < 4 ? (
              <Button
                type="button"
                onClick={() => setCurrentStep(currentStep + 1)}
                disabled={!canProceed()}
              >
                הבא
                <ChevronLeft className="mr-1 h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isSubmitting ? (
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="ml-2 h-4 w-4" />
                )}
                סיים והמשך
              </Button>
            )}
          </div>
          </>
          )}
        </div>
      </div>
    </div>
  )
}
