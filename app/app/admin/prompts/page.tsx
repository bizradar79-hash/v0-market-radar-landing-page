"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import {
  Loader2, Play, CheckCircle2, Clock, Zap, ChevronRight,
  RotateCcw, FileCode2, Sparkles,
} from "lucide-react"
import { AVAILABLE_MODELS, type ModelProvider } from "@/lib/available-models"

// ── Default prompts per module ─────────────────────────────────────────────
const DEFAULT_PROMPTS: Record<string, { prompt: string; provider: ModelProvider; model: string }> = {
  news: {
    provider: 'xai',
    model: 'grok-4-fast-non-reasoning',
    prompt: `חפש 10 חדשות עדכניות ורלוונטיות לתעשייה ולשוק הישראלי.

הנחיות:
- חדשות מהחודש האחרון בלבד
- רלוונטיות לתעשייה ולמוצרים של החברה
- כלול חדשות מישראל ומהעולם
- העדף מקורות אמינים (ynet, calcalist, globes, techcrunch, reuters)

החזר JSON בלבד:
{
  "news": [
    {
      "title": "כותרת",
      "source": "שם אתר",
      "url": "https://...",
      "category": "ישראל או עולם",
      "sentiment": "positive / negative / neutral",
      "summary": "תקציר קצר עד 150 מילים"
    }
  ]
}`,
  },
  conferences: {
    provider: 'xai',
    model: 'grok-4-fast-non-reasoning',
    prompt: `חפש 10 כנסים, ימי עיון ואירועים מקצועיים רלוונטיים לתחום החברה בישראל ובעולם.
הנחיות:
- אירועים מהחודשים הקרובים בלבד
- רלוונטיים לתחום: {{industry}} ולמוצרים: {{products}}
- כלול כנסים בישראל ובחו"ל
- כלול שם האירוע, תאריך, מיקום, קישור
החזר JSON בלבד:
{"conferences": [{"name": "", "date": "", "location": "", "url": "", "description": "", "relevance": ""}]}`,
  },
  tenders: {
    provider: 'xai',
    model: 'grok-4-fast-non-reasoning',
    prompt: `חפש 10 מכרזים פעילים רלוונטיים לחברה בישראל.
הנחיות:
- מכרזים פעילים בלבד (לא פגי תוקף)
- רלוונטיים לתחום: {{industry}} ולמוצרים: {{products}}
- כלול מכרזי ממשלה, עיריות וגופים ציבוריים
החזר JSON בלבד:
{"tenders": [{"title": "", "publisher": "", "deadline": "", "url": "", "description": "", "budget": ""}]}`,
  },
}

// ── Types ──────────────────────────────────────────────────────────────────
interface PromptVersion {
  id: string
  module: string
  prompt: string
  model_provider: string
  model_name: string
  version: number
  is_active: boolean
  was_active: boolean
  created_by: string | null
  created_at: string
  test_result: any | null
  tested_with_company_id: string | null
}

interface Company {
  id: string
  name: string
  website?: string
}

const MODULE_TABS = [
  { id: 'news', label: 'חדשות', active: true },
  { id: 'conferences', label: 'כנסים', active: true },
  { id: 'tenders', label: 'מכרזים', active: true },
  { id: 'trends', label: 'טרנדים', active: false },
  { id: 'competitors', label: 'מתחרים', active: false },
  { id: 'seo', label: 'SEO', active: false },
  { id: 'geo', label: 'GEO', active: false },
]

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return iso }
}

function parseModuleResults(module: string, raw: string): { items: any[]; type: string } | null {
  try {
    const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(clean)
    if (module === 'news' && parsed.news) return { items: parsed.news, type: 'news' }
    if (module === 'conferences' && parsed.conferences) return { items: parsed.conferences, type: 'conferences' }
    if (module === 'tenders' && parsed.tenders) return { items: parsed.tenders, type: 'tenders' }
    // Try as array
    if (Array.isArray(parsed) && parsed.length > 0) return { items: parsed, type: module }
    return null
  } catch { return null }
}

function modelLabel(provider: string, modelId: string): string {
  const p = AVAILABLE_MODELS[provider as ModelProvider]
  if (!p) return modelId
  return p.models.find(m => m.id === modelId)?.label ?? modelId
}

// ── Result card components ────────────────────────────────────────────────
function NewsCard({ item }: { item: any }) {
  return (
    <div className="border rounded-lg p-3 bg-background">
      <div className="flex items-start justify-between gap-2 mb-1">
        <h4 className="font-medium text-sm">{item.title}</h4>
        <div className="flex gap-1 shrink-0 flex-wrap justify-end">
          {item.source && <span className="text-xs bg-muted px-2 py-0.5 rounded">{item.source}</span>}
          {item.sentiment && (
            <span className={`text-xs px-2 py-0.5 rounded ${item.sentiment === 'positive' ? 'bg-green-100 text-green-700' : item.sentiment === 'negative' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
              {item.sentiment}
            </span>
          )}
          {item.category && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{item.category}</span>}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{item.summary}</p>
      {item.url && <a href={item.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline mt-1 block">קרא עוד ↗</a>}
    </div>
  )
}

function ConferenceCard({ item }: { item: any }) {
  return (
    <div className="border rounded-lg p-3 bg-background">
      <div className="flex items-start justify-between gap-2 mb-1">
        <h4 className="font-medium text-sm">{item.name}</h4>
        <div className="flex gap-1 shrink-0 flex-wrap justify-end">
          {item.date && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{item.date}</span>}
          {item.relevance && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">{item.relevance}</span>}
        </div>
      </div>
      {item.location && <p className="text-xs text-muted-foreground mb-1">📍 {item.location}</p>}
      {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
      {item.url && <a href={item.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline mt-1 block">פרטים נוספים ↗</a>}
    </div>
  )
}

function TenderCard({ item }: { item: any }) {
  const today = new Date().toISOString().split('T')[0]
  const isSoon = item.deadline && item.deadline <= new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
  return (
    <div className="border rounded-lg p-3 bg-background">
      <div className="flex items-start justify-between gap-2 mb-1">
        <h4 className="font-medium text-sm">{item.title}</h4>
        {item.deadline && (
          <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${isSoon ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
            {isSoon ? '⚠️ ' : ''}עד {item.deadline}
          </span>
        )}
      </div>
      {item.publisher && <p className="text-xs text-muted-foreground mb-1">🏛 {item.publisher}</p>}
      {item.budget && item.budget !== 'לא צוין' && <p className="text-xs text-muted-foreground mb-1">💰 {item.budget}</p>}
      {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
      {item.url && <a href={item.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline mt-1 block">לדף המכרז ↗</a>}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────
export default function PromptsPage() {
  const [activeModule, setActiveModule] = useState('news')
  const [versions, setVersions] = useState<PromptVersion[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [versionsLoading, setVersionsLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [activating, setActivating] = useState(false)
  const [seeding, setSeeding] = useState(false)

  // Sandbox state
  const [sbProvider, setSbProvider] = useState<ModelProvider>('xai')
  const [sbModel, setSbModel] = useState('grok-4-fast-non-reasoning')
  const [sbPrompt, setSbPrompt] = useState('')
  const [sbCompanyId, setSbCompanyId] = useState('')
  const [sandboxVersionId, setSandboxVersionId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<any | null>(null)

  const { toast } = useToast()

  const activeVersion = versions.find(v => v.is_active) ?? null

  // ── Load ────────────────────────────────────────────────────────────────
  const loadVersions = useCallback(async (module_: string) => {
    setVersionsLoading(true)
    const res = await fetch(`/api/admin/prompts?module=${module_}`)
    const data = await res.json()
    setVersions(data.versions ?? [])
    setVersionsLoading(false)
  }, [])

  const loadCompanies = useCallback(async () => {
    const res = await fetch('/api/admin/companies')
    const data = await res.json()
    setCompanies(data.companies ?? [])
  }, [])

  useEffect(() => {
    loadCompanies()
  }, [loadCompanies])

  useEffect(() => {
    setTestResult(null)
    setSandboxVersionId(null)
    setSbPrompt('')
    loadVersions(activeModule).then(() => {
      seedDefaultIfEmpty(activeModule)
    })
  }, [activeModule, loadVersions])

  // Seed default prompt if none exists for this module
  async function seedDefaultIfEmpty(module: string) {
    const def = DEFAULT_PROMPTS[module]
    if (!def) return
    const res = await fetch(`/api/admin/prompts?module=${module}`)
    const data = await res.json()
    if ((data.versions ?? []).length === 0) {
      setSeeding(true)
      const saveRes = await fetch('/api/admin/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module,
          prompt: def.prompt,
          model_provider: def.provider,
          model_name: def.model,
          created_by: 'system',
        }),
      })
      const saved = await saveRes.json()
      if (saved.version?.id) {
        await fetch('/api/admin/prompts/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: saved.version.id }),
        })
      }
      await loadVersions(module)
      setSeeding(false)
    }
  }

  // ── Copy active to sandbox ───────────────────────────────────────────────
  function editActive() {
    if (!activeVersion) return
    setSbPrompt(activeVersion.prompt)
    setSbProvider(activeVersion.model_provider as ModelProvider)
    setSbModel(activeVersion.model_name)
    setSandboxVersionId(null)
    setTestResult(null)
  }

  function restoreVersion(v: PromptVersion) {
    setSbPrompt(v.prompt)
    setSbProvider(v.model_provider as ModelProvider)
    setSbModel(v.model_name)
    setSandboxVersionId(null)
    setTestResult(null)
  }

  // ── Provider change → reset model to first of that provider ─────────────
  function handleProviderChange(p: ModelProvider) {
    setSbProvider(p)
    setSbModel(AVAILABLE_MODELS[p].models[0].id)
  }

  // ── Save to history ──────────────────────────────────────────────────────
  async function saveVersion() {
    if (!sbPrompt.trim()) return
    setSaving(true)
    const res = await fetch('/api/admin/prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        module: activeModule,
        prompt: sbPrompt,
        model_provider: sbProvider,
        model_name: sbModel,
        created_by: 'admin',
      }),
    })
    const data = await res.json()
    if (data.version?.id) {
      setSandboxVersionId(data.version.id)
      await loadVersions(activeModule)
      toast({ title: 'נשמר', description: `גרסה ${data.version.version} נשמרה בהיסטוריה` })
    } else {
      toast({ title: 'שגיאה', description: data.error, variant: 'destructive' })
    }
    setSaving(false)
  }

  // ── Run test ─────────────────────────────────────────────────────────────
  async function runTest() {
    if (!sbPrompt.trim()) return
    setTesting(true)
    setTestResult(null)

    try {
      // Save first if not saved yet
      let versionId = sandboxVersionId
      if (!versionId) {
        const saveRes = await fetch('/api/admin/prompts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            module: activeModule,
            prompt: sbPrompt,
            model_provider: sbProvider,
            model_name: sbModel,
            created_by: 'admin',
          }),
        })
        const saved = await saveRes.json()
        if (saved.version?.id) {
          versionId = saved.version.id
          setSandboxVersionId(versionId)
        }
      }

      const res = await fetch('/api/admin/prompts/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: sbPrompt,
          model_provider: sbProvider,
          model_name: sbModel,
          company_id: sbCompanyId || null,
          module: activeModule,
          version_id: versionId,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setTestResult(data.results)
        toast({ title: 'בדיקה הושלמה', description: `${data.results.latency_ms}ms · ${data.results.tokens_used} טוקנים` })
        loadVersions(activeModule)
      } else {
        toast({ title: 'שגיאה בבדיקה', description: data.error ?? JSON.stringify(data), variant: 'destructive' })
      }
    } catch (e: any) {
      toast({ title: 'שגיאה', description: e?.message, variant: 'destructive' })
    } finally {
      setTesting(false)
    }
  }

  // ── Push to production ───────────────────────────────────────────────────
  async function activate(id: string) {
    setActivating(true)
    const res = await fetch('/api/admin/prompts/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    const data = await res.json()
    if (data.success) {
      await loadVersions(activeModule)
      toast({ title: '✅ הופעל בפרודקשיין!', description: 'הגרסה הנבחרת פעילה עכשיו' })
    } else {
      toast({ title: 'שגיאה', description: data.error, variant: 'destructive' })
    }
    setActivating(false)
  }

  const defaultPromptForModule = DEFAULT_PROMPTS[activeModule]?.prompt ?? ''

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-16" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">ניהול פרומפטים</h1>
          <p className="text-muted-foreground text-sm mt-1">ערוך, בדוק ודחוף פרומפטים לפרודקשיין</p>
        </div>
        {seeding && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            מייצר פרומפט ברירת מחדל...
          </div>
        )}
      </div>

      {/* Module tabs */}
      <div className="flex gap-1 border-b">
        {MODULE_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => tab.active && setActiveModule(tab.id)}
            className={`relative px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeModule === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            } ${!tab.active ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            {tab.label}
            {!tab.active && (
              <span className="mr-1.5 text-[10px] bg-muted rounded px-1">בקרוב</span>
            )}
          </button>
        ))}
      </div>

      {versionsLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* ── LEFT: Active in production ── */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <h2 className="font-semibold text-base">פעיל בפרודקשיין</h2>
            </div>

            {activeVersion ? (
              <div className="rounded-xl border bg-card p-5 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className="bg-green-100 text-green-800 border-green-200">
                      גרסה {activeVersion.version}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {AVAILABLE_MODELS[activeVersion.model_provider as ModelProvider]?.label ?? activeVersion.model_provider}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {modelLabel(activeVersion.model_provider, activeVersion.model_name)}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(activeVersion.created_at)}
                  </span>
                </div>

                <Textarea
                  value={activeVersion.prompt}
                  readOnly
                  rows={12}
                  className="font-mono text-xs bg-muted/50 resize-none"
                />

                <Button variant="outline" className="w-full" onClick={editActive}>
                  <FileCode2 className="ml-2 h-4 w-4" />
                  ערוך ב-Sandbox
                </Button>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
                <FileCode2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">אין גרסה פעילה עדיין</p>
                {defaultPromptForModule && (
                  <Button className="mt-4" size="sm" onClick={() => setSbPrompt(defaultPromptForModule)}>
                    התחל מפרומפט ברירת מחדל
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* ── RIGHT: Sandbox ── */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-base">Sandbox</h2>
              {sandboxVersionId && (
                <Badge variant="secondary" className="text-xs">שמור</Badge>
              )}
            </div>

            <div className="rounded-xl border bg-card p-5 space-y-4">
              {/* Provider selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">ספק AI</label>
                <div className="flex gap-2">
                  {(Object.keys(AVAILABLE_MODELS) as ModelProvider[]).map(p => (
                    <button
                      key={p}
                      onClick={() => handleProviderChange(p)}
                      className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium border transition-colors ${
                        sbProvider === p
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:border-primary/50'
                      }`}
                    >
                      {AVAILABLE_MODELS[p].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Model dropdown */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">מודל</label>
                <Select value={sbModel} onValueChange={setSbModel}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AVAILABLE_MODELS[sbProvider].models.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Prompt textarea */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">פרומפט</label>
                <Textarea
                  value={sbPrompt}
                  onChange={e => { setSbPrompt(e.target.value); setSandboxVersionId(null) }}
                  rows={14}
                  placeholder="הכנס פרומפט כאן..."
                  className="font-mono text-xs resize-none"
                  dir="rtl"
                />
                {activeModule === 'tenders' && (
                  <div className="mt-2 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2 text-xs text-blue-700">
                    <span className="text-base">🔄</span>
                    <span>
                      <strong>חיפוש דו-שלבי: Gemini + xAI</strong> —
                      שלב 1: Gemini מוצא תוכן מכרזים (ללא URLs).
                      שלב 2: xAI מחפש את הקישור הרשמי לכל מכרז.
                      הספק/מודל הנבחר למעלה אינו בשימוש במכרזים.
                    </span>
                  </div>
                )}
                <details className="mt-2">
                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                    📋 משתני תבנית זמינים (לחץ להצגה)
                  </summary>
                  <div className="mt-2 p-3 bg-muted rounded-lg text-xs space-y-1 font-mono">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      <span className="text-blue-600">{"{{"+"company_name"+"}}"}</span>
                      <span className="text-muted-foreground">שם החברה</span>
                      <span className="text-blue-600">{"{{"+"industry"+"}}"}</span>
                      <span className="text-muted-foreground">תעשייה / תחום עיסוק</span>
                      <span className="text-blue-600">{"{{"+"core_activity"+"}}"}</span>
                      <span className="text-muted-foreground">פעילות עיקרית של החברה</span>
                      <span className="text-blue-600">{"{{"+"products"+"}}"}</span>
                      <span className="text-muted-foreground">מוצרים ושירותים (מופרדים בפסיקים)</span>
                      <span className="text-blue-600">{"{{"+"keywords"+"}}"}</span>
                      <span className="text-muted-foreground">מילות מפתח (מופרדות בפסיקים)</span>
                      <span className="text-blue-600">{"{{"+"website"+"}}"}</span>
                      <span className="text-muted-foreground">כתובת האתר</span>
                      <span className="text-blue-600">{"{{"+"target_audience"+"}}"}</span>
                      <span className="text-muted-foreground">קהלי יעד</span>
                      <span className="text-blue-600">{"{{"+"competitors"+"}}"}</span>
                      <span className="text-muted-foreground">שמות המתחרים</span>
                    </div>
                    <p className="text-muted-foreground mt-2 text-xs not-italic">
                      * המשתנים מוחלפים אוטומטית בנתוני החברה הנבחרת בזמן הרצת הבדיקה
                    </p>
                  </div>
                </details>
              </div>

              {/* Company selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">חברה לבדיקה</label>
                <Select
                  value={sbCompanyId || "none"}
                  onValueChange={v => setSbCompanyId(v === "none" ? "" : v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="בחר חברה (אופציונלי)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">ללא הקשר חברה</SelectItem>
                    {companies.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}{c.website ? ` (${c.website})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={runTest}
                  disabled={testing || !sbPrompt.trim()}
                >
                  {testing ? (
                    <><Loader2 className="ml-2 h-4 w-4 animate-spin" />מריץ...</>
                  ) : (
                    <><Play className="ml-2 h-4 w-4" />הרץ בדיקה ▶</>
                  )}
                </Button>
                <Button variant="outline" onClick={saveVersion} disabled={saving || !sbPrompt.trim()}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'שמור'}
                </Button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── Test Results (outside grid so loadVersions can't hide them) ── */}
      {testResult && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-semibold text-base">תוצאות בדיקה</h3>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {testResult.latency_ms}ms
              </span>
              <span className="flex items-center gap-1">
                <Zap className="h-3 w-3" />
                {testResult.tokens_used} טוקנים
              </span>
              <Badge variant="outline" className="text-xs">{testResult.model_provider} / {testResult.model_name}</Badge>
            </div>
          </div>

          {/* Results — module-specific cards or raw fallback */}
          {(() => {
            const parsed = parseModuleResults(activeModule, testResult.raw_text ?? '')
            if (parsed && parsed.items.length > 0) {
              return (
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {parsed.items.map((item: any, i: number) => {
                    if (parsed.type === 'news') return <NewsCard key={i} item={item} />
                    if (parsed.type === 'conferences') return <ConferenceCard key={i} item={item} />
                    if (parsed.type === 'tenders') return <TenderCard key={i} item={item} />
                    return <pre key={i} className="text-xs bg-muted p-2 rounded">{JSON.stringify(item, null, 2)}</pre>
                  })}
                </div>
              )
            }
            return <pre className="text-xs bg-muted p-3 rounded max-h-96 overflow-auto whitespace-pre-wrap">{testResult.raw_text || '(no output)'}</pre>
          })()}

          {/* Push to production */}
          {sandboxVersionId && (
            <Button
              className="w-full bg-green-600 hover:bg-green-700 text-white"
              onClick={() => activate(sandboxVersionId)}
              disabled={activating}
            >
              {activating ? (
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="ml-2 h-4 w-4" />
              )}
              דחוף לפרודקשיין ✓
            </Button>
          )}
        </div>
      )}

      {/* ── Version history ── */}
      {versions.some(v => v.is_active || v.was_active) && (
        <div className="space-y-3">
          <h2 className="font-semibold text-base border-t pt-4">היסטוריית גרסאות</h2>
          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-right px-4 py-2.5">גרסה</th>
                  <th className="text-right px-4 py-2.5 hidden md:table-cell">ספק</th>
                  <th className="text-right px-4 py-2.5 hidden md:table-cell">מודל</th>
                  <th className="text-right px-4 py-2.5 hidden lg:table-cell">תאריך</th>
                  <th className="text-right px-4 py-2.5 hidden lg:table-cell">נבדק</th>
                  <th className="text-right px-4 py-2.5">פעיל</th>
                  <th className="text-right px-4 py-2.5">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[
                  ...versions.filter(v => v.is_active),
                  ...versions.filter(v => !v.is_active && v.was_active),
                ].slice(0, 5).map(v => (
                  <tr key={v.id} className={v.is_active ? 'bg-green-50/50' : 'hover:bg-muted/30'}>
                    <td className="px-4 py-3 font-mono font-semibold">v{v.version}</td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <Badge variant="outline" className="text-xs">
                        {AVAILABLE_MODELS[v.model_provider as ModelProvider]?.label ?? v.model_provider}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                      {modelLabel(v.model_provider, v.model_name)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
                      {formatDate(v.created_at)}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {v.test_result ? (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          {v.test_result.latency_ms}ms
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {v.is_active ? (
                        <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">פעיל</Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs px-2"
                          onClick={() => restoreVersion(v)}
                          title="שחזר ל-sandbox"
                        >
                          <RotateCcw className="h-3 w-3 ml-1" />
                          שחזר
                        </Button>
                        {!v.is_active && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs px-2 text-green-700 hover:text-green-800"
                            onClick={() => activate(v.id)}
                            disabled={activating}
                          >
                            <ChevronRight className="h-3 w-3 ml-1" />
                            הפעל
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
