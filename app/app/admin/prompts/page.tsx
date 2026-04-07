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

// ── Default news prompt (seeded on first load) ─────────────────────────────
const DEFAULT_NEWS_PROMPT = `חפש 10 חדשות עדכניות ורלוונטיות לתעשייה ולשוק הישראלי.

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
}`

// ── Types ──────────────────────────────────────────────────────────────────
interface PromptVersion {
  id: string
  module: string
  prompt: string
  model_provider: string
  model_name: string
  version: number
  is_active: boolean
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
  { id: 'trends', label: 'טרנדים', active: false },
  { id: 'competitors', label: 'מתחרים', active: false },
  { id: 'seo', label: 'SEO', active: false },
  { id: 'geo', label: 'GEO', active: false },
]

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return iso }
}

function modelLabel(provider: string, modelId: string): string {
  const p = AVAILABLE_MODELS[provider as ModelProvider]
  if (!p) return modelId
  return p.models.find(m => m.id === modelId)?.label ?? modelId
}

// ── Page ──────────────────────────────────────────────────────────────────
export default function PromptsPage() {
  const [activeModule, setActiveModule] = useState('news')
  const [versions, setVersions] = useState<PromptVersion[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
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
    setLoading(true)
    const res = await fetch(`/api/admin/prompts?module=${module_}`)
    const data = await res.json()
    setVersions(data.versions ?? [])
    setLoading(false)
  }, [])

  const loadCompanies = useCallback(async () => {
    const res = await fetch('/api/admin/companies')
    const data = await res.json()
    console.log('companies loaded:', data.companies, data.error)
    setCompanies(data.companies ?? [])
  }, [])

  useEffect(() => {
    loadCompanies()
  }, [loadCompanies])

  useEffect(() => {
    loadVersions(activeModule).then(() => {
      // After loading, seed default if no versions exist for 'news'
      if (activeModule === 'news') {
        seedDefaultIfEmpty()
      }
    })
  }, [activeModule, loadVersions])

  // Seed default news prompt if none exists
  async function seedDefaultIfEmpty() {
    const res = await fetch('/api/admin/prompts?module=news')
    const data = await res.json()
    if ((data.versions ?? []).length === 0) {
      setSeeding(true)
      const saveRes = await fetch('/api/admin/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module: 'news',
          prompt: DEFAULT_NEWS_PROMPT,
          model_provider: 'xai',
          model_name: 'grok-4-fast-non-reasoning',
          created_by: 'system',
        }),
      })
      const saved = await saveRes.json()
      if (saved.version?.id) {
        // Activate it
        await fetch('/api/admin/prompts/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: saved.version.id }),
        })
      }
      await loadVersions('news')
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
        await loadVersions(activeModule)
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
      await loadVersions(activeModule)
      toast({ title: 'בדיקה הושלמה', description: `${data.results.latency_ms}ms · ${data.results.tokens_used} טוקנים` })
    } else {
      toast({ title: 'שגיאה בבדיקה', description: data.error, variant: 'destructive' })
    }
    setTesting(false)
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

      {loading ? (
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
                <Button className="mt-4" size="sm" onClick={() => setSbPrompt(DEFAULT_NEWS_PROMPT)}>
                  התחל מפרומפט ברירת מחדל
                </Button>
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

            {/* Test Results */}
            {testResult && (
              <div className="rounded-xl border bg-card p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">תוצאות בדיקה</h3>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {testResult.latency_ms}ms
                    </span>
                    <span className="flex items-center gap-1">
                      <Zap className="h-3 w-3" />
                      {testResult.tokens_used} טוקנים
                    </span>
                  </div>
                </div>

                {/* Parsed news items */}
                {Array.isArray(testResult.parsed?.news) && testResult.parsed.news.length > 0 ? (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {testResult.parsed.news.map((item: any, i: number) => (
                      <div key={i} className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
                        <div className="font-medium text-sm">{item.title}</div>
                        <div className="text-muted-foreground">{item.summary?.slice(0, 120)}</div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">{item.source}</Badge>
                          {item.category && <Badge variant="secondary" className="text-[10px]">{item.category}</Badge>}
                          {item.sentiment && (
                            <Badge className={`text-[10px] ${item.sentiment === 'positive' ? 'bg-green-100 text-green-700' : item.sentiment === 'negative' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
                              {item.sentiment}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg bg-muted/50 p-3">
                    <pre className="text-xs overflow-x-auto whitespace-pre-wrap break-all text-muted-foreground">
                      {testResult.raw_text?.slice(0, 800)}
                    </pre>
                  </div>
                )}

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
                    ✓ דחוף לפרודקשיין
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Version history ── */}
      {versions.length > 0 && (
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
                {versions.slice(0, 5).map(v => (
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
