"use client"

// FIX 5 — Reusable live scan-progress modal.
// Polls /api/scan/status?company_id= every ~2s and renders one row per module
// with ⏳ ממתין / 🔄 רץ / ✓ הושלם / ⏭ דולג / ⚠ נכשל. Shows X/N progress, elapsed
// time and the running AI-call count, plus an embedded "עצור סריקה" button that
// POSTs /api/scan/stop. Closing the modal does NOT stop the scan — reopening it
// resumes the live view because all state lives in companies.scan_control.

import { useEffect, useRef, useState } from "react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Square, RefreshCw } from "lucide-react"
import { OLD_COMPETITOR_MODULE_ENABLED } from "@/lib/flags"

type ModuleStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error'
type ScanStatus = 'running' | 'done' | 'stopped' | 'error'

interface ScanModuleState { status: ModuleStatus; message?: string; updated_at: string }
interface ScanControl {
  status: ScanStatus
  profile: 'initial' | 'weekly'
  started_at: string
  finished_at?: string | null
  call_count: number
  max_calls: number
  max_seconds: number
  abort_reason?: string | null
  modules: Record<string, ScanModuleState>
  cost_breakdown?: Record<string, { calls: number; costUSD: number; promptTokens?: number; completionTokens?: number }>
}

// Ordered module ids + Hebrew labels (mirror sync/run MODULE_IDS).
const MODULE_LABELS: Array<{ id: string; label: string }> = [
  { id: 'overview',           label: 'ניתוח פרופיל עסקי' },
  { id: 'swot',               label: 'ניתוח SWOT' },
  // Old competitor module is flagged off — these steps no longer run, so they
  // must not appear as perpetually-pending rows in the progress modal.
  ...(OLD_COMPETITOR_MODULE_ENABLED
    ? [{ id: 'competitors', label: 'גילוי מתחרים' },
       { id: 'competitor_ratings', label: 'דירוגי מתחרים' }]
    : []),
  { id: 'review_analysis',    label: 'ניתוח ביקורות' },
  { id: 'seo_ranking',        label: 'דירוג SEO' },
  { id: 'geo_ranking',        label: 'דירוג GEO' },
  { id: 'industry_trends',    label: 'טרנדים בתעשייה' },
  { id: 'keyword_trends',     label: 'טרנדים לפי מילות מפתח' },
  { id: 'competitor_trends',  label: 'טרנדים מתחרים' },
  { id: 'news',               label: 'חדשות' },
  { id: 'tenders',            label: 'מכרזים' },
  { id: 'conferences',        label: 'כנסים' },
  { id: 'leads',              label: 'לידים' },
  { id: 'weekly_actions',     label: 'פעולות שבועיות' },
  { id: 'niche_opportunities',label: 'הזדמנויות נישה' },
  { id: 'weekly_report',      label: 'דוח שבועי' },
]

function StatusIcon({ status }: { status: ModuleStatus }) {
  switch (status) {
    case 'running': return <span className="text-blue-500 animate-pulse">🔄</span>
    case 'done':    return <span className="text-green-600">✓</span>
    case 'skipped': return <span className="text-muted-foreground">⏭</span>
    case 'error':   return <span className="text-amber-500">⚠</span>
    default:        return <span className="text-muted-foreground/60">⏳</span>
  }
}

const STATUS_LABEL: Record<ModuleStatus, string> = {
  pending: 'ממתין', running: 'רץ', done: 'הושלם', skipped: 'דולג', error: 'נכשל',
}

function fmtElapsed(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}ש׳`
}

export function ScanProgressModal({
  companyId,
  companyName,
  open,
  onClose,
}: {
  companyId: string | null
  companyName?: string
  open: boolean
  onClose: () => void
}) {
  const [control, setControl] = useState<ScanControl | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Poll scan_control while the modal is open.
  useEffect(() => {
    if (!open || !companyId) return
    let cancelled = false

    async function poll() {
      try {
        const res = await fetch(`/api/scan/status?company_id=${encodeURIComponent(companyId!)}`)
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (data?.scan_control) {
          setControl(data.scan_control as ScanControl)
          setError(null)
        } else {
          setControl(null)
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'poll error')
      }
    }

    poll()
    pollRef.current = setInterval(poll, 2000)
    return () => {
      cancelled = true
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [open, companyId])

  // Elapsed-time ticker, anchored to started_at while running.
  useEffect(() => {
    if (!open) return
    function tick() {
      if (control?.started_at) {
        const base = control.finished_at ?? new Date().toISOString()
        setElapsed(Math.max(0, Math.floor((new Date(base).getTime() - new Date(control.started_at).getTime()) / 1000)))
      }
    }
    tick()
    tickRef.current = setInterval(tick, 1000)
    return () => { if (tickRef.current) clearInterval(tickRef.current) }
  }, [open, control?.started_at, control?.finished_at])

  async function stopScan() {
    if (!companyId) return
    setStopping(true)
    try {
      const res = await fetch('/api/scan/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `HTTP ${res.status}`)
      }
    } catch (e: any) {
      setError(e?.message ?? 'stop failed')
    } finally {
      setStopping(false)
    }
  }

  const modules = control?.modules ?? {}
  const total = MODULE_LABELS.length
  const completed = MODULE_LABELS.filter(m => {
    const s = modules[m.id]?.status
    return s === 'done' || s === 'skipped' || s === 'error'
  }).length
  const isRunning = control?.status === 'running'
  const headerBadge =
    control?.status === 'done' ? <Badge className="bg-green-100 text-green-700 border-green-200">✓ הושלם</Badge>
    : control?.status === 'stopped' ? <Badge className="bg-amber-100 text-amber-700 border-amber-200">⏹ נעצר</Badge>
    : control?.status === 'error' ? <Badge className="bg-red-100 text-red-700 border-red-200">⚠ {control.abort_reason || 'שגיאה'}</Badge>
    : isRunning ? <Badge className="bg-blue-100 text-blue-700 border-blue-200 animate-pulse">🔄 רץ</Badge>
    : <Badge variant="outline">— ממתין</Badge>

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            סריקה — {companyName || companyId?.slice(0, 8)}
          </DialogTitle>
        </DialogHeader>

        {/* The scan runs server-side (sync/run after()-chain) — tab-close-safe. */}
        <p className="rounded-lg bg-teal-500/5 px-3 py-2 text-xs leading-relaxed text-teal-700">
          הסריקה רצה ברקע — אפשר לסגור את הדף, הדוח יחכה לך כאן כשתחזור.
        </p>

        {/* Summary bar */}
        <div className="flex flex-wrap items-center gap-3 text-sm border-b pb-3">
          {headerBadge}
          <span className="text-muted-foreground">
            {completed}/{total} מודולים
          </span>
          <span className="text-muted-foreground">⏱ {fmtElapsed(elapsed)}</span>
          {control && (
            <span className="text-muted-foreground">
              קריאות AI: {control.call_count}/{control.max_calls}
            </span>
          )}
          {control?.profile && (
            <Badge variant="outline" className="text-xs">
              {control.profile === 'weekly' ? 'שבועית (רזה)' : 'מלאה'}
            </Badge>
          )}
        </div>

        {/* Progress bar */}
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-teal-500 rounded-full transition-all duration-500"
            style={{ width: `${total ? (completed / total) * 100 : 0}%` }}
          />
        </div>

        {/* Module rows */}
        <div className="space-y-1">
          {MODULE_LABELS.map(m => {
            const st = modules[m.id]?.status ?? 'pending'
            const msg = modules[m.id]?.message
            return (
              <div
                key={m.id}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                  st === 'running' ? 'border-blue-300 bg-blue-50/50' : 'border-border'
                }`}
              >
                <span className="text-base leading-none w-5 text-center"><StatusIcon status={st} /></span>
                <span className="flex-1 font-medium">{m.label}</span>
                {msg && <span className="text-xs text-muted-foreground max-w-[45%] truncate">{msg}</span>}
                <span className="text-xs text-muted-foreground shrink-0">{STATUS_LABEL[st]}</span>
              </div>
            )
          })}
        </div>

        {/* Cost breakdown — shown once the scan has a terminal status. */}
        {!isRunning && control?.cost_breakdown && Object.keys(control.cost_breakdown).length > 0 && (() => {
          const cb = control.cost_breakdown!
          const rows = Object.entries(cb)
            .filter(([k]) => k !== 'total')
            .map(([id, v]) => ({
              id,
              label: MODULE_LABELS.find(m => m.id === id)?.label ?? id,
              calls: v?.calls ?? 0,
              costUSD: v?.costUSD ?? 0,
            }))
            .sort((a, b) => b.costUSD - a.costUSD)
          const totalCalls = rows.reduce((s, r) => s + r.calls, 0)
          const totalUSD = rows.reduce((s, r) => s + r.costUSD, 0)
          return (
            <div className="border-t pt-3 mt-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold">עלות סריקה</span>
                <span className="text-xs text-muted-foreground">
                  {totalCalls} קריאות · ${totalUSD.toFixed(4)}
                </span>
              </div>
              <div className="space-y-0.5">
                {rows.map(r => (
                  <div key={r.id} className="flex items-center gap-2 text-xs px-1 py-0.5">
                    <span className="flex-1 truncate">{r.label}</span>
                    <span className="text-muted-foreground tabular-nums w-12 text-center shrink-0">{r.calls}</span>
                    <span className="font-medium tabular-nums w-16 text-left shrink-0">${r.costUSD.toFixed(4)}</span>
                  </div>
                ))}
                <div className="flex items-center gap-2 text-xs px-1 pt-1.5 mt-1 border-t font-semibold">
                  <span className="flex-1">סה״כ</span>
                  <span className="tabular-nums w-12 text-center shrink-0">{totalCalls}</span>
                  <span className="tabular-nums w-16 text-left shrink-0">${totalUSD.toFixed(4)}</span>
                </div>
              </div>
            </div>
          )
        })()}

        {error && (
          <p className="text-xs text-amber-600">⚠ {error}</p>
        )}
        {!control && !error && (
          <p className="text-xs text-muted-foreground text-center py-2">
            ממתין לתחילת הסריקה...
          </p>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {isRunning && (
            <Button
              variant="outline"
              className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
              onClick={stopScan}
              disabled={stopping}
            >
              {stopping ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Square className="h-4 w-4 ml-2" />}
              עצור סריקה
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            {isRunning ? 'סגור (הסריקה ממשיכה)' : 'סגור'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
