"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Play, ChevronDown, ChevronUp, Building2, Lightbulb, FlaskConical, Search, RefreshCw } from "lucide-react"

// TikTok removed from the ACTIVE flow (unreliable). Its label is kept so
// previously-stored runs still render correctly.
const SOURCES = ['website', 'instagram', 'facebook', 'linkedin'] as const
type Source = 'website' | 'instagram' | 'facebook' | 'linkedin' | 'tiktok'
const SOURCE_LABELS: Record<Source, string> = {
  website: 'אתר', instagram: 'אינסטגרם', facebook: 'פייסבוק', linkedin: 'לינקדאין', tiktok: 'טיקטוק',
}
const MAX_COMPETITORS = 5

interface Company { id: string; name: string; website?: string }
interface SocialPost { caption: string; date: string; likes?: number | null; comments?: number | null; shares?: number | null; views?: number | null; hashtags?: string[]; postUrl?: string }
interface ProfileMeta { followers?: number | null; bio?: string; name?: string }
type SourceStatus = 'ok' | 'empty' | 'failed' | 'skipped' | 'processing'
interface SourceResult { source: Source; status: SourceStatus; url?: string; text?: string; posts?: SocialPost[]; profile?: ProfileMeta; postsTotal?: number; postsRecent?: number; snapshotId?: string; error?: string }
interface BriefingItem { what: string; source: Source; date?: string; kind?: string; implication?: string }
interface DerivedInsights {
  cadence?: { total: number; level: string; text: string }
  themes?: { terms: Array<{ term: string; count: number }>; text: string }
  topPosts?: Array<{ caption: string; source: Source; date: string; engagement: number; text: string }>
  presence?: { source: Source; count: number; text: string }
  followers?: Array<{ source: Source; followers: number }>
  noRecentActivity?: boolean
  windowDays?: number
}
interface Briefing { summary: string; items: BriefingItem[]; sourcesUsed: Source[]; sourcesEmpty: Source[]; insights?: DerivedInsights; llmSkipped?: boolean; generatedAt: string }
interface RunCost {
  brightdata: { requests: number; scrapes: number; searches: number; records?: number; perRequestUSD: number; perRecordUSD?: number; costUSD: number; precision: 'exact' }
  llm: { model: string; promptTokens: number; completionTokens: number; costUSD: number; precision: 'exact' | 'estimated' } | null
  totalUSD: number
}
interface Run { id?: string; competitor_name: string; sources: SourceResult[]; briefing: Briefing | null; cost?: RunCost | null; created_at?: string }

interface CompetitorInput { name: string; urls: Record<string, string>; selected: Record<string, boolean> }
const emptyCompetitor = (): CompetitorInput => ({
  name: '',
  urls: { website: '', instagram: '', facebook: '', linkedin: '' },
  // A source is scraped only when CHECKED. Discovery ticks the ones it finds.
  selected: { website: false, instagram: false, facebook: false, linkedin: false },
})

function statusBadge(s: SourceResult['status'], error?: string) {
  if (s === 'ok') return <Badge className="bg-green-100 text-green-700 border-green-200">ok</Badge>
  if (s === 'processing') return <Badge className="bg-blue-100 text-blue-700 border-blue-200">בתהליך</Badge>
  if (s === 'empty') return <Badge variant="outline" className="text-amber-600 border-amber-300">ריק</Badge>
  if (s === 'skipped') return <Badge variant="outline" className="text-muted-foreground">{error === 'not_selected' ? 'לא נבחר' : 'לא נבדק'}</Badge>
  return <Badge className="bg-red-100 text-red-700 border-red-200">נכשל</Badge>
}

export default function CompetitorIntelDevPage() {
  const { toast } = useToast()
  const [companies, setCompanies] = useState<Company[]>([])
  const [search, setSearch] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [competitors, setCompetitors] = useState<CompetitorInput[]>([emptyCompetitor()])
  const [runs, setRuns] = useState<Run[]>([])
  const [running, setRunning] = useState<number | null>(null)
  const [runningAll, setRunningAll] = useState(false)
  const [expandedRaw, setExpandedRaw] = useState<string | null>(null)
  const [bdConfigured, setBdConfigured] = useState<boolean | null>(null)
  const [recencyDays, setRecencyDays] = useState(45)
  const [finding, setFinding] = useState<number | null>(null)
  const [rechecking, setRechecking] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/companies').then(r => r.json())
      .then(d => setCompanies(Array.isArray(d.companies) ? d.companies : []))
      .catch(() => setCompanies([]))
  }, [])

  useEffect(() => {
    if (!companyId) { setRuns([]); return }
    fetch(`/api/admin/competitor-intel?company_id=${companyId}`).then(r => r.json())
      .then(d => { setRuns(Array.isArray(d.runs) ? d.runs : []); setBdConfigured(!!d.brightdata); if (d.recencyDays) setRecencyDays(d.recencyDays) })
      .catch(() => setRuns([]))
  }, [companyId])

  const filtered = companies
    .filter(c => !search.trim() || (c.name || '').toLowerCase().includes(search.toLowerCase()))
    .slice(0, 40)
  const selected = companies.find(c => c.id === companyId)

  function updateCompetitor(i: number, patch: Partial<CompetitorInput>) {
    setCompetitors(prev => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  }
  function updateUrl(i: number, source: Source, value: string) {
    // Typing a URL auto-selects that source; clearing it deselects.
    setCompetitors(prev => prev.map((c, idx) => (idx === i
      ? { ...c, urls: { ...c.urls, [source]: value }, selected: { ...c.selected, [source]: !!value.trim() } }
      : c)))
  }
  function toggleSource(i: number, source: Source) {
    setCompetitors(prev => prev.map((c, idx) => (idx === i
      ? { ...c, selected: { ...c.selected, [source]: !c.selected[source] } } : c)))
  }

  // ── STEP 1: "מצא לינקים" — targeted search per platform, fills the fields.
  // Search-only (no scraping) so it's cheap; every URL stays editable.
  async function findLinks(i: number) {
    const comp = competitors[i]
    if (!comp.name.trim()) {
      toast({ title: 'חסר שם', description: 'הזן שם מתחרה כדי לחפש לינקים', variant: 'destructive' })
      return
    }
    setFinding(i)
    try {
      const res = await fetch('/api/admin/competitor-intel', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: comp.name.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      const found: Record<string, string> = data.urls || {}
      setCompetitors(prev => prev.map((c, idx) => {
        if (idx !== i) return c
        const urls = { ...c.urls }
        const selected = { ...c.selected }
        for (const src of SOURCES) {
          if (found[src]) { urls[src] = found[src]; selected[src] = true }
          // Nothing found → leave blank + unchecked; the admin can paste one.
        }
        return { ...c, urls, selected }
      }))
      const n = SOURCES.filter(src => found[src]).length
      toast({ title: `נמצאו ${n} מתוך ${SOURCES.length} לינקים`, description: n < SOURCES.length ? 'ניתן להשלים ידנית את מה שחסר' : undefined })
    } catch (e: any) {
      toast({ title: 'שגיאה בחיפוש', description: e?.message, variant: 'destructive' })
    } finally {
      setFinding(null)
    }
  }

  // "בדוק שוב" — re-poll an existing snapshot. No re-trigger → no extra cost.
  async function recheck(runIdx: number, srcIdx: number) {
    const run = runs[runIdx]
    const src = run?.sources?.[srcIdx]
    if (!src?.snapshotId) return
    const key = `${runIdx}-${srcIdx}`
    setRechecking(key)
    try {
      const res = await fetch('/api/admin/competitor-intel', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshot_id: src.snapshotId, source: src.source, url: src.url }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setRuns(prev => prev.map((r, ri) => (ri !== runIdx ? r : {
        ...r, sources: r.sources.map((sc, si) => (si === srcIdx ? { ...sc, ...data.result } : sc)),
      })))
      const st = data.result?.status
      toast({
        title: st === 'ok' ? '✅ הנתונים התקבלו' : st === 'processing' ? 'עדיין רץ' : `סטטוס: ${st}`,
        description: st === 'processing' ? 'נסה שוב בעוד רגע' : undefined,
      })
    } catch (e: any) {
      toast({ title: 'שגיאה', description: e?.message, variant: 'destructive' })
    } finally {
      setRechecking(null)
    }
  }

  async function runOne(i: number): Promise<boolean> {
    const comp = competitors[i]
    if (!companyId || !comp.name.trim()) {
      toast({ title: 'חסר מידע', description: 'בחר חברה והזן שם מתחרה', variant: 'destructive' })
      return false
    }
    setRunning(i)
    try {
      const res = await fetch('/api/admin/competitor-intel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId, competitor: { name: comp.name.trim(), urls: comp.urls, selected: comp.selected } }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setRuns(prev => [data.run, ...prev])
      if (data.stored === false) {
        toast({ title: 'הורץ (לא נשמר)', description: `יש להריץ את המיגרציה: ${data.storeError || ''}` })
      } else {
        toast({ title: '✅ הסתיים', description: comp.name.trim() })
      }
      return true
    } catch (e: any) {
      toast({ title: 'שגיאה', description: e?.message, variant: 'destructive' })
      return false
    } finally {
      setRunning(null)
    }
  }

  async function runAll() {
    setRunningAll(true)
    try {
      for (let i = 0; i < competitors.length; i++) {
        if (!competitors[i].name.trim()) continue
        await runOne(i) // sequential — keeps BrightData load sane
      }
    } finally {
      setRunningAll(false)
    }
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FlaskConical className="h-6 w-6 text-primary" />
          מעקב מתחרים (פיתוח)
        </h1>
        <p className="text-muted-foreground">
          סביבת בדיקה מבודדת — BrightData סורק 4 מקורות לכל מתחרה (רשתות חברתיות דרך סקרייפרים ייעודיים, אתר דרך Web Unlocker), ו-LLM מייצר תדריך שבועי. לא משפיע על סריקות הלקוחות.
        </p>
        {bdConfigured === false && (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            ⚠ BRIGHTDATA_API_TOKEN לא מוגדר בסביבה הזו — הרצות יחזירו שגיאת מקור. הגדר את המפתח כדי לסרוק באמת.
          </p>
        )}
      </div>

      {/* Company picker */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" />1. בחר חברה (הקשר הלקוח)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="חפש חברה…" value={search} onChange={e => setSearch(e.target.value)} />
          <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
            {filtered.map(c => (
              <button
                key={c.id}
                onClick={() => setCompanyId(c.id)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  companyId === c.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {c.name}
              </button>
            ))}
            {filtered.length === 0 && <p className="text-sm text-muted-foreground">לא נמצאו חברות</p>}
          </div>
          {selected && <p className="text-xs text-muted-foreground">נבחר: <b>{selected.name}</b>{selected.website ? ` · ${selected.website}` : ''}</p>}
        </CardContent>
      </Card>

      {/* Competitors */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">2. מתחרים (עד {MAX_COMPETITORS})</CardTitle>
            <div className="flex gap-2">
              {competitors.length < MAX_COMPETITORS && (
                <Button size="sm" variant="outline" onClick={() => setCompetitors(p => [...p, emptyCompetitor()])}>
                  הוסף מתחרה
                </Button>
              )}
              <Button size="sm" onClick={runAll} disabled={!companyId || runningAll || running !== null}>
                {runningAll ? <Loader2 className="h-4 w-4 animate-spin ml-1.5" /> : <Play className="h-4 w-4 ml-1.5" />}
                הרץ הכל
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {competitors.map((c, i) => (
            <div key={i} className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="שם המתחרה"
                  value={c.name}
                  onChange={e => updateCompetitor(i, { name: e.target.value })}
                  className="font-medium"
                />
                {/* STEP 1 — find links (search only, no scraping) */}
                <Button
                  size="sm" variant="outline" className="shrink-0"
                  onClick={() => findLinks(i)}
                  disabled={!c.name.trim() || finding !== null || running !== null || runningAll}
                >
                  {finding === i ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  <span className="mr-1.5">מצא לינקים</span>
                </Button>
                {/* STEP 2 — scrape ONLY the checked sources */}
                <Button
                  size="sm" className="shrink-0"
                  onClick={() => runOne(i)}
                  disabled={!companyId || running !== null || runningAll || !SOURCES.some(src => c.selected[src] && c.urls[src]?.trim())}
                >
                  {running === i ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  <span className="mr-1.5">סרוק</span>
                </Button>
                {competitors.length > 1 && (
                  <Button size="sm" variant="ghost" onClick={() => setCompetitors(p => p.filter((_, idx) => idx !== i))} className="shrink-0">✕</Button>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {SOURCES.map(src => (
                  <div key={src} className="space-y-1">
                    <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={!!c.selected[src]}
                        onChange={() => toggleSource(i, src)}
                        disabled={!c.urls[src]?.trim()}
                        className="h-3.5 w-3.5 accent-teal-600 disabled:opacity-40"
                      />
                      <span className={c.selected[src] ? 'font-semibold text-foreground' : ''}>{SOURCE_LABELS[src]}</span>
                    </label>
                    <Input
                      dir="ltr"
                      placeholder="ריק = לא ייסרק"
                      value={c.urls[src]}
                      onChange={e => updateUrl(i, src, e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Results */}
      {runs.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">3. היסטוריית הרצות (6 אחרונות) — גולמי + תדריך + עלות</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            {runs.map((run, ri) => (
              <div key={run.id || ri} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="font-bold">{run.competitor_name}</h3>
                  {run.created_at && <span className="text-xs text-muted-foreground">{new Date(run.created_at).toLocaleString('he-IL')}</span>}
                </div>

                {/* Per-run cost — BrightData is exact (counted requests); the
                    model line is labeled by the precision we actually have. */}
                {run.cost && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-muted/40 px-3 py-2 text-[11px]">
                    <span>
                      BrightData: <b>${run.cost.brightdata.costUSD.toFixed(4)}</b>
                      <Badge variant="outline" className="mr-1.5 border-green-300 text-green-700 py-0 h-4 text-[9px]">מדויק</Badge>
                      <span className="text-muted-foreground">
                        ({run.cost.brightdata.requests} בקשות × ${run.cost.brightdata.perRequestUSD}
                        {!!run.cost.brightdata.records && ` + ${run.cost.brightdata.records} רשומות × $${run.cost.brightdata.perRecordUSD}`}
                        {' '}· {run.cost.brightdata.scrapes} אתר · {run.cost.brightdata.searches} חיפושים)
                      </span>
                    </span>
                    {run.cost.llm && (
                      <span>
                        מודל ({run.cost.llm.model}): <b>{(run.cost.llm.promptTokens + run.cost.llm.completionTokens).toLocaleString()}</b> טוקנים ≈{' '}
                        <b>${run.cost.llm.costUSD.toFixed(4)}</b>
                        <Badge
                          variant="outline"
                          className={`mr-1.5 py-0 h-4 text-[9px] ${run.cost.llm.precision === 'exact' ? 'border-green-300 text-green-700' : 'border-amber-300 text-amber-700'}`}
                        >
                          {run.cost.llm.precision === 'exact' ? 'מדויק' : 'הערכה'}
                        </Badge>
                      </span>
                    )}
                    <span className="font-bold">סה"כ: ${run.cost.totalUSD.toFixed(4)}</span>
                  </div>
                )}

                {/* Per-source status */}
                <div className="flex flex-wrap gap-2">
                  {(run.sources || []).map((s, si) => (
                    <span key={si} className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
                      <b>{SOURCE_LABELS[s.source] || s.source}</b>
                      {statusBadge(s.status, s.error)}
                      {s.status === 'processing' && s.snapshotId && (
                        <Button
                          size="sm" variant="ghost" className="h-5 px-1.5 text-[10px]"
                          onClick={() => recheck(ri, si)}
                          disabled={rechecking === `${ri}-${si}`}
                        >
                          {rechecking === `${ri}-${si}`
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <><RefreshCw className="h-3 w-3 ml-1" />בדוק שוב</>}
                        </Button>
                      )}
                      {s.error && s.error !== 'not_selected' && (
                        <span className="text-muted-foreground truncate max-w-[200px]" title={s.error}>{s.error}</span>
                      )}
                    </span>
                  ))}
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  {/* RAW (calibration) */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground">גולמי (לכיול)</p>
                    {/* Dedicated-scraper sources render STRUCTURED posts (TikTok today) */}
                    {(run.sources || []).filter(s => (s.posts || []).length > 0).map((s, si) => (
                      <div key={`p-${si}`} className="rounded border">
                        <div className="border-b bg-muted/40 px-2 py-1.5 text-xs font-medium">
                          {SOURCE_LABELS[s.source]} · {(s.postsTotal ?? s.posts!.length).toLocaleString()} פוסטים סה"כ
                          {s.postsRecent != null && (
                            <span className="text-primary"> · {s.postsRecent} ב-{recencyDays} הימים האחרונים</span>
                          )}
                          {s.profile?.followers != null && <span className="text-muted-foreground"> · {s.profile.followers.toLocaleString()} עוקבים</span>}
                        </div>
                        <div className="max-h-72 space-y-1.5 overflow-auto p-2">
                          {s.posts!.map((p, pi) => (
                            <div key={pi} className="rounded bg-muted/30 p-2 text-[11px] space-y-1">
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <span>{p.date ? new Date(p.date).toLocaleDateString('he-IL') : 'ללא תאריך'}</span>
                                {p.views != null && <span>👁 {p.views.toLocaleString()}</span>}
                                {p.likes != null && <span>❤ {p.likes.toLocaleString()}</span>}
                                {p.comments != null && <span>💬 {p.comments.toLocaleString()}</span>}
                                {p.shares != null && <span>↗ {p.shares.toLocaleString()}</span>}
                              </div>
                              {p.caption && <p className="leading-relaxed">{p.caption}</p>}
                              {!!p.hashtags?.length && <p className="text-primary/70">{p.hashtags.slice(0, 8).map(h => (h.startsWith('#') ? h : `#${h}`)).join(' ')}</p>}
                              {p.postUrl && <a href={p.postUrl} target="_blank" rel="noopener noreferrer" dir="ltr" className="block truncate text-primary hover:underline">{p.postUrl}</a>}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}

                    {/* Generic Web-Unlocker sources render raw markdown */}
                    {(run.sources || []).filter(s => s.text && !(s.posts || []).length).map((s, si) => {
                      const key = `${ri}-${si}`
                      const open = expandedRaw === key
                      return (
                        <div key={si} className="rounded border">
                          <button
                            onClick={() => setExpandedRaw(open ? null : key)}
                            className="flex w-full items-center justify-between px-2 py-1.5 text-xs font-medium hover:bg-muted/40"
                          >
                            <span>{SOURCE_LABELS[s.source]} · {(s.text || '').length.toLocaleString()} תווים</span>
                            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </button>
                          {open && (
                            <pre dir="ltr" className="max-h-72 overflow-auto whitespace-pre-wrap break-words bg-muted/30 p-2 text-[10px] leading-relaxed">
                              {s.text}
                            </pre>
                          )}
                        </div>
                      )
                    })}
                    {(run.sources || []).every(s => !s.text && !(s.posts || []).length) && (
                      <p className="text-xs text-muted-foreground">אין נתונים גולמיים</p>
                    )}
                  </div>

                  {/* Briefing */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground">
                      תדריך (LLM)
                      {run.briefing?.llmSkipped && (
                        <Badge variant="outline" className="mr-1.5 border-amber-300 text-amber-700 py-0 h-4 text-[9px]">מכובה</Badge>
                      )}
                    </p>
                    {run.briefing?.llmSkipped && (
                      <p className="rounded-md bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
                        סיכום ה-LLM מכובה בזמן הכיול (COMPETITOR_INTEL_LLM_ENABLED=false) — לא בוצעה קריאת מודל.
                        התובנות למטה מחושבות בקוד וללא עלות.
                      </p>
                    )}
                    {run.briefing ? (
                      <div className="space-y-2">
                        {run.briefing.summary && (
                          <p className="rounded-lg bg-muted/40 px-3 py-2 text-sm">{run.briefing.summary}</p>
                        )}
                        {(run.briefing.items || []).map((it, ii) => (
                          <div key={ii} className="rounded-lg border px-3 py-2 space-y-1">
                            <div className="flex items-start gap-2">
                              <Badge variant="outline" className="shrink-0 text-[10px]">{SOURCE_LABELS[it.source] || it.source}</Badge>
                              <span className="text-sm flex-1">{it.what}</span>
                            </div>
                            {it.date && <p className="text-[11px] text-muted-foreground">{it.date}</p>}
                            {it.implication && (
                              <p className="text-xs text-amber-700 flex items-start gap-1.5">
                                <Lightbulb className="h-3.5 w-3.5 shrink-0 mt-0.5" />{it.implication}
                              </p>
                            )}
                          </div>
                        ))}
                        {(run.briefing.items || []).length === 0 && (
                          <p className="text-xs text-muted-foreground">לא זוהתה פעילות חדשה במקורות שנאספו.</p>
                        )}
                        {/* Derived insights — computed in code from the same scrapes */}
                        {run.briefing.insights && Object.keys(run.briefing.insights).length > 0 && (
                          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-1.5">
                            <p className="text-xs font-semibold text-primary">
                              תובנות נוספות
                              <span className="mr-1.5 font-normal text-muted-foreground">
                                ({run.briefing.insights.windowDays ?? recencyDays} הימים האחרונים)
                              </span>
                            </p>
                            {run.briefing.insights.noRecentActivity && (
                              <p className="text-xs text-muted-foreground">
                                אין פעילות ב-{run.briefing.insights.windowDays ?? recencyDays} הימים האחרונים.
                              </p>
                            )}
                            {run.briefing.insights.cadence && (
                              <p className="text-xs">📅 {run.briefing.insights.cadence.text}</p>
                            )}
                            {run.briefing.insights.presence && (
                              <p className="text-xs">📍 {run.briefing.insights.presence.text}</p>
                            )}
                            {run.briefing.insights.themes && (
                              <p className="text-xs">🏷 {run.briefing.insights.themes.text}</p>
                            )}
                            {(run.briefing.insights.topPosts || []).map((tp, ti) => (
                              <p key={ti} className="text-xs">
                                🔥 הפוסט שהכי עבד להם ({SOURCE_LABELS[tp.source] || tp.source}): {tp.caption || '(ללא כיתוב)'}
                                <span className="text-muted-foreground"> — {tp.text}</span>
                              </p>
                            ))}
                            {(run.briefing.insights.followers || []).length > 0 && (
                              <p className="text-xs text-muted-foreground">
                                👥 עוקבים: {run.briefing.insights.followers!.map(f => `${SOURCE_LABELS[f.source] || f.source} ${f.followers.toLocaleString()}`).join(' · ')}
                                <span className="opacity-70"> (צמיחה תוצג לאחר 2+ סריקות)</span>
                              </p>
                            )}
                          </div>
                        )}
                        {(run.briefing.sourcesEmpty || []).length > 0 && (
                          <p className="text-[11px] text-muted-foreground">
                            ללא נתונים: {run.briefing.sourcesEmpty.map(s => SOURCE_LABELS[s] || s).join(', ')}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">אין תדריך</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
