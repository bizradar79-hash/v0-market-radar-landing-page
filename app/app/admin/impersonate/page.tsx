"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Loader2, ShieldCheck, ExternalLink, Building2, RefreshCw,
  CheckCircle2, XCircle, FileText, Minus, Trash2, Cpu, History, RotateCcw,
  CalendarClock, Square, Plus, X, Save, Link2, Copy, Check, EyeOff,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { ScanProgressModal } from "@/components/scan-progress-modal"

interface SyncLogEntry {
  module: string
  status: 'ok' | 'error' | 'skipped' | string
  duration_ms?: number
  error?: string
  message?: string
}

interface UserRow {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
  company: {
    name: string
    industry: string
    website: string
    last_sync_at: string | null
    next_sync_at: string | null
    sync_status: string | null
    sync_log: SyncLogEntry[] | null
    report_token?: string | null
  } | null
}

interface ReportSnapshot {
  id: string
  snapshot_token: string
  label: string | null
  created_at: string
}

// Admin soft-hide (impersonate-only): remove specific items from a client's view.
type HiddenItemType = 'tender' | 'conference' | 'lead' | 'news' | 'competitor' | 'channel' | 'trend'
interface ClientItem { label: string; sub: string }
interface HiddenItem { id: string; item_type: HiddenItemType; item_key: string; label: string | null; reason: string | null; hidden_at: string }

const HIDE_TYPE_LABELS: Record<HiddenItemType, string> = {
  tender: 'מכרזים', conference: 'כנסים', lead: 'לידים', news: 'חדשות',
  competitor: 'מתחרים', channel: 'ערוצי הפצה', trend: 'מגמות מפתח',
}
const HIDE_TYPE_ORDER: HiddenItemType[] = ['tender', 'conference', 'lead', 'news', 'competitor', 'channel', 'trend']

const REPORT_BASE = 'https://www.nsradar.co.il'

type ModuleState = 'idle' | 'running' | 'ok' | 'error'

const SYNC_MODULES = [
  { id: 'news',        label: 'חדשות',      emoji: '📰' },
  { id: 'conferences', label: 'כנסים',      emoji: '🏛️' },
  { id: 'tenders',     label: 'מכרזים',     emoji: '📋' },
  { id: 'competitors', label: 'מתחרים',     emoji: '👥' },
  { id: 'leads',       label: 'לידים',      emoji: '🎯' },
  { id: 'seo',         label: 'SEO',         emoji: '📈' },
  { id: 'geo',         label: 'GEO',         emoji: '🌐' },
  { id: 'trends',      label: 'טרנדים',     emoji: '📊' },
  { id: 'keyword_trends', label: 'טרנדים לפי מילות מפתח', emoji: '🔑' },
  { id: 'reviews',     label: 'ביקורות',    emoji: '⭐' },
  { id: 'report',      label: 'דוח שבועי',  emoji: '📄' },
]

function SyncStatusBadge({ status }: { status: string | null }) {
  if (status === 'running') {
    return (
      <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs animate-pulse">
        ⟳ מסנכרן
      </Badge>
    )
  }
  if (status === 'done') {
    return <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">✓ עדכני</Badge>
  }
  if (status === 'error') {
    return <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">✗ שגיאה</Badge>
  }
  return <Badge className="bg-gray-100 text-gray-500 border-gray-200 text-xs">— ממתין</Badge>
}

function ModuleButton({ state, emoji, label, onClick, disabled }: {
  state: ModuleState
  emoji: string
  label: string
  onClick: () => void
  disabled: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || state === 'running'}
      className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs font-medium transition-all min-w-[64px] ${
        state === 'running'
          ? 'border-blue-300 bg-blue-50 text-blue-700 cursor-wait'
          : state === 'ok'
          ? 'border-green-300 bg-green-50 text-green-700'
          : state === 'error'
          ? 'border-red-300 bg-red-50 text-red-700'
          : 'border-border hover:border-primary/50 hover:bg-muted/50 text-foreground disabled:opacity-40 disabled:cursor-not-allowed'
      }`}
    >
      <span className="text-base leading-none">
        {state === 'running' ? '⟳' : state === 'ok' ? '✅' : state === 'error' ? '❌' : emoji}
      </span>
      <span>{label}</span>
    </button>
  )
}

export default function ImpersonatePage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [impersonating, setImpersonating] = useState<string | null>(null)

  const [triggering, setTriggering] = useState<Record<string, boolean>>({})
  const [pollingUsers, setPollingUsers] = useState<Set<string>>(new Set())

  const [deleteConfirmUser, setDeleteConfirmUser] = useState<UserRow | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const [refreshingAll, setRefreshingAll] = useState(false)
  const [refreshAllProgress, setRefreshAllProgress] = useState(0)
  const [showConfirmAll, setShowConfirmAll] = useState(false)

  const [logModalUser, setLogModalUser] = useState<UserRow | null>(null)
  const [recoveringStuck, setRecoveringStuck] = useState(false)
  const [runningWeekly, setRunningWeekly] = useState(false)
  const [stopping, setStopping] = useState<Record<string, boolean>>({})
  // FIX 5 — live progress modal target ({ id, name } of the scanning company)
  const [progressUser, setProgressUser] = useState<UserRow | null>(null)

  // Per-module sync state: { userId: { moduleId: ModuleState } }
  const [moduleStates, setModuleStates] = useState<Record<string, Record<string, ModuleState>>>({})
  const [moduleSyncUser, setModuleSyncUser] = useState<UserRow | null>(null)

  // GEO queries editor (inside the per-module dialog)
  const [geoQueries, setGeoQueries] = useState<string[]>([])
  const [geoQueriesLoading, setGeoQueriesLoading] = useState(false)
  const [geoQueriesSaving, setGeoQueriesSaving] = useState(false)
  const [newGeoQuery, setNewGeoQuery] = useState("")
  const [distChannels, setDistChannels] = useState<string[]>([])
  const [distChannelsLoading, setDistChannelsLoading] = useState(false)
  const [distChannelsSaving, setDistChannelsSaving] = useState(false)
  const [newDistChannel, setNewDistChannel] = useState("")
  const [reportSnapshots, setReportSnapshots] = useState<ReportSnapshot[]>([])
  const [reportSnapshotsLoading, setReportSnapshotsLoading] = useState(false)
  const [generatingReport, setGeneratingReport] = useState(false)
  const [regenActions, setRegenActions] = useState(false)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  // Admin soft-hide (content management) dialog
  const [contentUser, setContentUser] = useState<UserRow | null>(null)
  const [clientItems, setClientItems] = useState<Record<HiddenItemType, ClientItem[]> | null>(null)
  const [hiddenItems, setHiddenItems] = useState<HiddenItem[]>([])
  const [contentLoading, setContentLoading] = useState(false)
  const [hidingKey, setHidingKey] = useState<string | null>(null)

  // Snapshot restore (Layer 3)
  const [snapshotUser, setSnapshotUser] = useState<UserRow | null>(null)
  const [snapshots, setSnapshots] = useState<any[]>([])
  const [snapshotsLoading, setSnapshotsLoading] = useState(false)
  const [restoringId, setRestoringId] = useState<string | null>(null)

  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    checkAdminAndLoad()
  }, [])

  useEffect(() => {
    if (pollingUsers.size === 0) return
    const interval = setInterval(async () => {
      const ids = [...pollingUsers]
      const { data } = await supabase
        .from('companies')
        .select('id, sync_status, last_sync_at, next_sync_at, sync_log')
        .in('id', ids)
      if (!data) return

      setUsers(prev => prev.map(u => {
        const fresh = data.find(d => d.id === u.id)
        if (!fresh) return u
        return {
          ...u,
          company: u.company ? {
            ...u.company,
            sync_status: fresh.sync_status,
            last_sync_at: fresh.last_sync_at,
            next_sync_at: fresh.next_sync_at,
            sync_log: fresh.sync_log,
          } : u.company,
        }
      }))

      const stillRunning = new Set(
        data.filter(d => d.sync_status === 'running').map(d => d.id)
      )
      setPollingUsers(stillRunning)

      data.forEach(d => {
        if (!pollingUsers.has(d.id)) return
        if (d.sync_status === 'done' || d.sync_status === 'error') {
          const u = users.find(u => u.id === d.id)
          const okCount = Array.isArray(d.sync_log)
            ? d.sync_log.filter((l: any) => l.status === 'ok').length
            : 0
          toast({
            title: d.sync_status === 'done' ? `סנכרון הושלם — ${u?.company?.name || d.id}` : `שגיאה בסנכרון — ${u?.company?.name || d.id}`,
            description: d.sync_status === 'done' ? `${okCount} מודולים עודכנו` : 'בדוק פרטי סנכרון',
            variant: d.sync_status === 'done' ? 'default' : 'destructive',
          })
        }
      })
    }, 5000)

    return () => clearInterval(interval)
  }, [pollingUsers, users])

  async function checkAdminAndLoad() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }

    const { data: role } = await supabase
      .from('user_roles').select('is_admin').eq('user_id', user.id).single()
    if (!role?.is_admin) { router.replace('/app/dashboard'); return }

    const res = await fetch('/api/admin/generate-magic-link?list=1')
    const data = await res.json()
    if (data.users) {
      setUsers(data.users)
      const running = new Set<string>(
        (data.users as UserRow[])
          .filter(u => u.company?.sync_status === 'running')
          .map(u => u.id)
      )
      if (running.size > 0) setPollingUsers(running)
    }
    setLoading(false)
  }

  async function impersonate(targetUser: UserRow) {
    setImpersonating(targetUser.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        sessionStorage.setItem('admin_access_token', session.access_token)
        sessionStorage.setItem('admin_refresh_token', session.refresh_token)
        sessionStorage.setItem('is_impersonating', 'true')
        sessionStorage.setItem('admin_email', session.user.email ?? '')
      }

      const res = await fetch('/api/admin/generate-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetUser.id }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) {
        sessionStorage.removeItem('admin_access_token')
        sessionStorage.removeItem('admin_refresh_token')
        sessionStorage.removeItem('is_impersonating')
        sessionStorage.removeItem('admin_email')
        toast({ title: "שגיאה", description: data.error || "לא ניתן ליצור קישור", variant: "destructive" })
        setImpersonating(null)
        return
      }
      window.location.href = data.url
    } catch {
      sessionStorage.removeItem('admin_access_token')
      sessionStorage.removeItem('admin_refresh_token')
      sessionStorage.removeItem('is_impersonating')
      sessionStorage.removeItem('admin_email')
      toast({ title: "שגיאה", description: "אירעה שגיאה", variant: "destructive" })
      setImpersonating(null)
    }
  }

  async function triggerSync(userId: string, profile: 'initial' | 'weekly' = 'initial') {
    setTriggering(prev => ({ ...prev, [userId]: true }))
    try {
      setUsers(prev => prev.map(u => u.id === userId && u.company
        ? { ...u, company: { ...u.company, sync_status: 'running' } }
        : u
      ))
      fetch('/api/sync/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: userId, force: true, profile }),
      }).catch(() => {})
      setPollingUsers(prev => new Set([...prev, userId]))
      // FIX 5 — open the live progress modal for this company.
      const target = users.find(u => u.id === userId) || null
      if (target) setProgressUser(target)
      if (profile === 'weekly') {
        toast({ title: 'סריקה שבועית הופעלה', description: 'רענון רזה — מודולים דינמיים בלבד' })
      }
    } catch (e: any) {
      toast({ title: "שגיאה", description: e?.message, variant: "destructive" })
    } finally {
      setTriggering(prev => ({ ...prev, [userId]: false }))
    }
  }

  // FIX 3 — "עצור סריקה": flip scan_control.status='stopped' so the running
  // orchestrator aborts at its next module boundary.
  async function stopSync(userId: string) {
    setStopping(prev => ({ ...prev, [userId]: true }))
    try {
      const res = await fetch('/api/scan/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: userId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setUsers(prev => prev.map(u => u.id === userId && u.company
        ? { ...u, company: { ...u.company, sync_status: 'stopped' } }
        : u
      ))
      toast({ title: 'נשלחה בקשת עצירה', description: 'הסריקה תיעצר בשלב הבא' })
    } catch (e: any) {
      toast({ title: 'שגיאה בעצירה', description: e?.message, variant: 'destructive' })
    } finally {
      setStopping(prev => ({ ...prev, [userId]: false }))
    }
  }

  async function syncModule(userId: string, moduleId: string) {
    setModuleStates(prev => ({
      ...prev,
      [userId]: { ...(prev[userId] || {}), [moduleId]: 'running' },
    }))
    try {
      const res = await fetch('/api/admin/sync-module', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: userId, module: moduleId }),
      })
      const ok = res.ok
      setModuleStates(prev => ({
        ...prev,
        [userId]: { ...(prev[userId] || {}), [moduleId]: ok ? 'ok' : 'error' },
      }))
      const data = await res.json().catch(() => ({}))
      toast({
        title: ok ? `✅ ${SYNC_MODULES.find(m => m.id === moduleId)?.label} עודכן` : `❌ שגיאה ב-${SYNC_MODULES.find(m => m.id === moduleId)?.label}`,
        description: ok ? `${data.company_name}` : (data.results?.[0]?.body?.error ?? 'שגיאה לא ידועה'),
        variant: ok ? 'default' : 'destructive',
      })
      // Reset to idle after 4s
      setTimeout(() => {
        setModuleStates(prev => ({
          ...prev,
          [userId]: { ...(prev[userId] || {}), [moduleId]: 'idle' },
        }))
      }, 4000)
    } catch (e: any) {
      setModuleStates(prev => ({
        ...prev,
        [userId]: { ...(prev[userId] || {}), [moduleId]: 'error' },
      }))
      toast({ title: "שגיאה", description: e?.message, variant: "destructive" })
    }
  }

  // ── GEO queries editor ──────────────────────────────────────────────────
  // Load the client's stored business_profile.geoQueries when the module dialog
  // opens; admins edit + save them here (writes business_profile.geoQueries).
  useEffect(() => {
    if (!moduleSyncUser) { setGeoQueries([]); setNewGeoQuery(""); return }
    let cancelled = false
    setGeoQueriesLoading(true)
    fetch(`/api/admin/geo-queries?company_id=${moduleSyncUser.id}`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return
        setGeoQueries(Array.isArray(data.geoQueries) ? data.geoQueries : [])
      })
      .catch(() => { if (!cancelled) setGeoQueries([]) })
      .finally(() => { if (!cancelled) setGeoQueriesLoading(false) })
    return () => { cancelled = true }
  }, [moduleSyncUser])

  async function saveGeoQueries() {
    if (!moduleSyncUser) return
    setGeoQueriesSaving(true)
    try {
      const res = await fetch('/api/admin/geo-queries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: moduleSyncUser.id, geoQueries }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setGeoQueries(Array.isArray(data.geoQueries) ? data.geoQueries : geoQueries)
      toast({ title: '✅ שאלות GEO נשמרו', description: `${data.geoQueries?.length ?? 0} שאלות` })
    } catch (e: any) {
      toast({ title: 'שגיאה בשמירת שאלות GEO', description: e?.message, variant: 'destructive' })
    } finally {
      setGeoQueriesSaving(false)
    }
  }

  // ── Distribution channels editor (mirrors the GEO queries editor) ─────────
  // Writes business_profile.distributionChannels (+ the mirrored column) via
  // /api/admin/distribution-channels.
  useEffect(() => {
    if (!moduleSyncUser) { setDistChannels([]); setNewDistChannel(""); return }
    let cancelled = false
    setDistChannelsLoading(true)
    fetch(`/api/admin/distribution-channels?company_id=${moduleSyncUser.id}`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return
        setDistChannels(Array.isArray(data.distributionChannels) ? data.distributionChannels : [])
      })
      .catch(() => { if (!cancelled) setDistChannels([]) })
      .finally(() => { if (!cancelled) setDistChannelsLoading(false) })
    return () => { cancelled = true }
  }, [moduleSyncUser])

  async function saveDistChannels() {
    if (!moduleSyncUser) return
    setDistChannelsSaving(true)
    try {
      const res = await fetch('/api/admin/distribution-channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: moduleSyncUser.id, distributionChannels: distChannels }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setDistChannels(Array.isArray(data.distributionChannels) ? data.distributionChannels : distChannels)
      toast({ title: '✅ ערוצי הפצה נשמרו', description: `${data.distributionChannels?.length ?? 0} ערוצים` })
    } catch (e: any) {
      toast({ title: 'שגיאה בשמירת ערוצי הפצה', description: e?.message, variant: 'destructive' })
    } finally {
      setDistChannelsSaving(false)
    }
  }

  // ── Report links + archive snapshots ──────────────────────────────────────
  function copyLink(url: string, token: string) {
    navigator.clipboard?.writeText(url).then(() => {
      setCopiedToken(token)
      setTimeout(() => setCopiedToken(prev => (prev === token ? null : prev)), 1500)
    }).catch(() => {})
  }

  // Load the client's report snapshots when the module dialog opens.
  useEffect(() => {
    if (!moduleSyncUser) { setReportSnapshots([]); return }
    let cancelled = false
    setReportSnapshotsLoading(true)
    fetch(`/api/admin/report-snapshots?company_id=${moduleSyncUser.id}`)
      .then(res => res.json())
      .then(data => { if (!cancelled) setReportSnapshots(Array.isArray(data.snapshots) ? data.snapshots : []) })
      .catch(() => { if (!cancelled) setReportSnapshots([]) })
      .finally(() => { if (!cancelled) setReportSnapshotsLoading(false) })
    return () => { cancelled = true }
  }, [moduleSyncUser])

  // "צור דוח עדכני" — assemble CURRENT stored data into a fresh snapshot NOW.
  // No scan, no AI — pure read-only assembly of what's stored.
  async function generateFreshReport() {
    if (!moduleSyncUser) return
    setGeneratingReport(true)
    try {
      const res = await fetch('/api/admin/report-snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: moduleSyncUser.id, regenerate_actions: regenActions }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      toast({
        title: '✅ דוח עדכני נוצר',
        description: regenActions
          ? (data.actionsRegenerated ? 'המלצות רועננו + צילום מצב חדש נשמר' : 'צילום מצב נשמר (רענון ההמלצות נכשל)')
          : 'צילום מצב חדש נשמר בארכיון',
      })
      // Refresh the list.
      const list = await fetch(`/api/admin/report-snapshots?company_id=${moduleSyncUser.id}`).then(r => r.json()).catch(() => ({}))
      setReportSnapshots(Array.isArray(list.snapshots) ? list.snapshots : reportSnapshots)
    } catch (e: any) {
      toast({ title: 'שגיאה ביצירת דוח', description: e?.message, variant: 'destructive' })
    } finally {
      setGeneratingReport(false)
    }
  }

  // ── Admin soft-hide (content management) ───────────────────────────────────
  async function loadContent(companyId: string) {
    setContentLoading(true)
    try {
      const [itemsRes, hiddenRes] = await Promise.all([
        fetch(`/api/admin/client-items?company_id=${companyId}`).then(r => r.json()).catch(() => ({})),
        fetch(`/api/admin/hidden-items?company_id=${companyId}`).then(r => r.json()).catch(() => ({})),
      ])
      setClientItems(itemsRes?.items ?? null)
      setHiddenItems(Array.isArray(hiddenRes?.hidden) ? hiddenRes.hidden : [])
    } finally {
      setContentLoading(false)
    }
  }

  function openContent(u: UserRow) {
    setContentUser(u)
    setClientItems(null)
    setHiddenItems([])
    loadContent(u.id)
  }

  async function hideItem(itemType: HiddenItemType, label: string) {
    if (!contentUser) return
    const reason = window.prompt(`להסתיר "${label}" מהתצוגה של הלקוח?\nסיבה (אופציונלי):`, '')
    if (reason === null) return // cancelled
    const busyKey = `${itemType}:${label}`
    setHidingKey(busyKey)
    try {
      const res = await fetch('/api/admin/hidden-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: contentUser.id, item_type: itemType, label, reason: reason || undefined }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
      toast({ title: '👁️ הוסתר', description: `"${label}" לא יופיע ללקוח ולא יחזור בסריקות` })
      await loadContent(contentUser.id)
    } catch (e: any) {
      toast({ title: 'שגיאה בהסתרה', description: e?.message, variant: 'destructive' })
    } finally {
      setHidingKey(null)
    }
  }

  async function restoreHidden(id: string) {
    if (!contentUser) return
    setHidingKey(id)
    try {
      const res = await fetch('/api/admin/hidden-items', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
      toast({ title: '↩️ שוחזר', description: 'הפריט חזר לתצוגת הלקוח' })
      await loadContent(contentUser.id)
    } catch (e: any) {
      toast({ title: 'שגיאה בשחזור', description: e?.message, variant: 'destructive' })
    } finally {
      setHidingKey(null)
    }
  }

  async function openSnapshots(u: UserRow) {
    setSnapshotUser(u)
    setSnapshots([])
    setSnapshotsLoading(true)
    try {
      const res = await fetch(`/api/admin/list-snapshots?company_id=${u.id}`)
      const data = await res.json().catch(() => ({}))
      setSnapshots(Array.isArray(data.snapshots) ? data.snapshots : [])
    } catch (e: any) {
      toast({ title: "שגיאה בטעינת גיבויים", description: e?.message, variant: "destructive" })
    } finally {
      setSnapshotsLoading(false)
    }
  }

  async function restoreSnapshot(companyId: string, snapshotId: string) {
    if (!confirm('לשחזר את מצב הסריקה מגיבוי זה? פעולה זו תחליף את הנתונים הנוכחיים.')) return
    setRestoringId(snapshotId)
    try {
      const res = await fetch('/api/admin/restore-snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId, snapshot_id: snapshotId }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        toast({ title: "✅ שוחזר בהצלחה", description: `גיבוי ${snapshotId.slice(0, 8)} שוחזר` })
      } else {
        toast({ title: "❌ שחזור נכשל", description: data.error ?? `HTTP ${res.status}`, variant: "destructive" })
      }
    } catch (e: any) {
      toast({ title: "שגיאה", description: e?.message, variant: "destructive" })
    } finally {
      setRestoringId(null)
    }
  }

  async function refreshAllUsers() {
    setShowConfirmAll(false)
    setRefreshingAll(true)
    setRefreshAllProgress(0)
    const ids = new Set<string>()
    try {
      for (let i = 0; i < users.length; i++) {
        const u = users[i]
        setRefreshAllProgress(i + 1)
        setUsers(prev => prev.map(pu => pu.id === u.id && pu.company
          ? { ...pu, company: { ...pu.company, sync_status: 'running' } }
          : pu
        ))
        fetch('/api/sync/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ company_id: u.id, force: true }),
        }).catch(() => {})
        ids.add(u.id)
        await new Promise(r => setTimeout(r, 2000))
      }
      setPollingUsers(ids)
      toast({ title: "סנכרון הופעל לכולם", description: `${users.length} משתמשים בתהליך סנכרון` })
    } catch (e: any) {
      toast({ title: "שגיאה", description: e?.message, variant: "destructive" })
    } finally {
      setRefreshingAll(false)
      setRefreshAllProgress(0)
    }
  }

  async function recoverStuckSyncs() {
    setRecoveringStuck(true)
    try {
      const res = await fetch('/api/admin/recover-stuck-syncs', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Recovery failed')
      toast({
        title: 'שחרור סנכרונים תקועים',
        description: data.recovered > 0
          ? `${data.recovered} סנכרונים שוחררו: ${(data.names || []).join(', ')}`
          : 'לא נמצאו סנכרונים תקועים',
      })
      if (data.recovered > 0) checkAdminAndLoad()
    } catch (e: any) {
      toast({ title: 'שגיאה', description: e?.message, variant: 'destructive' })
    } finally {
      setRecoveringStuck(false)
    }
  }

  async function runWeeklyRefresh() {
    setRunningWeekly(true)
    try {
      const res = await fetch('/api/cron/weekly-user-refresh', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      toast({
        title: 'עדכון שבועי',
        description: data.processed > 0
          ? `${data.succeeded}/${data.processed} עודכנו בהצלחה, ${data.remaining} נותרו`
          : 'אין משתמשים הממתינים לעדכון',
      })
      if (data.processed > 0) checkAdminAndLoad()
    } catch (e: any) {
      toast({ title: 'שגיאה', description: e?.message, variant: 'destructive' })
    } finally {
      setRunningWeekly(false)
    }
  }

  async function deleteUser(targetUser: UserRow) {
    setDeleteConfirmUser(null)
    setDeleting(targetUser.id)
    try {
      const res = await fetch('/api/admin/delete-user', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: targetUser.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'שגיאה במחיקת המשתמש')
      setUsers(prev => prev.filter(u => u.id !== targetUser.id))
      toast({ title: "המשתמש נמחק", description: targetUser.email })
    } catch (e: any) {
      toast({ title: "שגיאה במחיקה", description: e?.message, variant: "destructive" })
    } finally {
      setDeleting(null)
    }
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">לוח ניהול</h1>
            <p className="text-muted-foreground">{users.length} משתמשים רשומים</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={runWeeklyRefresh}
            disabled={runningWeekly}
          >
            {runningWeekly
              ? <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              : <RefreshCw className="ml-2 h-4 w-4" />
            }
            הרץ עדכון שבועי
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={recoverStuckSyncs}
            disabled={recoveringStuck}
          >
            {recoveringStuck
              ? <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              : <Cpu className="ml-2 h-4 w-4" />
            }
            שחרר תקועים
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowConfirmAll(true)}
            disabled={refreshingAll || users.length === 0}
          >
            {refreshingAll
              ? <><Loader2 className="ml-2 h-4 w-4 animate-spin" />מעדכן {refreshAllProgress}/{users.length} משתמשים...</>
              : <><RefreshCw className="ml-2 h-4 w-4" />רענן כל המשתמשים</>
            }
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">כל המשתמשים</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">אימייל</TableHead>
                <TableHead className="text-right">חברה</TableHead>
                <TableHead className="text-right">סטטוס</TableHead>
                <TableHead className="text-right hidden lg:table-cell">עודכן</TableHead>
                <TableHead className="text-right hidden lg:table-cell">עדכון הבא</TableHead>
                <TableHead className="text-right">פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const syncStatus = u.company?.sync_status
                const isRunning = syncStatus === 'running' || pollingUsers.has(u.id)
                const isTriggering = triggering[u.id]
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <span className="font-mono text-sm">{u.email}</span>
                    </TableCell>
                    <TableCell>
                      {u.company ? (
                        <div className="flex items-center gap-2">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="font-medium text-sm">{u.company.name}</span>
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">אין חברה</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <SyncStatusBadge status={isRunning ? 'running' : (syncStatus ?? null)} />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-sm text-muted-foreground">
                        {u.company?.last_sync_at
                          ? new Date(u.company.last_sync_at).toLocaleDateString('he-IL')
                          : '—'}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-sm text-muted-foreground">
                        {u.company?.next_sync_at
                          ? new Date(u.company.next_sync_at).toLocaleDateString('he-IL')
                          : '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Full (initial) sync button */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => triggerSync(u.id, 'initial')}
                          disabled={isTriggering || isRunning || refreshingAll}
                          title="סנכרון מלא (initial)"
                        >
                          {isTriggering || isRunning
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <RefreshCw className="h-3.5 w-3.5" />
                          }
                        </Button>
                        {/* Weekly (lean) sync button */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => triggerSync(u.id, 'weekly')}
                          disabled={isTriggering || isRunning || refreshingAll}
                          title="הרץ סריקה שבועית (רזה — מודולים דינמיים בלבד)"
                        >
                          <CalendarClock className="h-3.5 w-3.5 ml-1" />
                          שבועית
                        </Button>
                        {/* FIX 5 — open live progress modal */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setProgressUser(u)}
                          title="צפה בהתקדמות הסריקה"
                        >
                          <Loader2 className={`h-3.5 w-3.5 ml-1 ${isRunning ? 'animate-spin' : ''}`} />
                          התקדמות
                        </Button>
                        {/* FIX 3 — Stop scan (only while running) */}
                        {isRunning && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                            onClick={() => stopSync(u.id)}
                            disabled={stopping[u.id]}
                            title="עצור סריקה"
                          >
                            {stopping[u.id]
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Square className="h-3.5 w-3.5 ml-1" />
                            }
                            עצור
                          </Button>
                        )}
                        {/* Per-module sync */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setModuleSyncUser(u)}
                          title="סנכרון מודולים"
                        >
                          <Cpu className="h-3.5 w-3.5 ml-1" />
                          מודולים
                        </Button>
                        {/* Details button */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setLogModalUser(u)}
                          title="פרטי סנכרון"
                        >
                          <FileText className="h-3.5 w-3.5 ml-1" />
                          פרטים
                        </Button>
                        {/* Snapshots / restore button */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openSnapshots(u)}
                          title="גיבויים ושחזור"
                        >
                          <History className="h-3.5 w-3.5 ml-1" />
                          גיבויים
                        </Button>
                        {/* Content management — admin soft-hide of client items */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openContent(u)}
                          title="הסתרת פריטים מתצוגת הלקוח"
                        >
                          <EyeOff className="h-3.5 w-3.5 ml-1" />
                          תוכן
                        </Button>
                        {/* Permanent client report link — copy + open */}
                        {u.company?.report_token && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => copyLink(`${REPORT_BASE}/r/${u.company!.report_token}`, `t-${u.id}`)}
                              title="העתק קישור לדוח הלקוח"
                            >
                              {copiedToken === `t-${u.id}`
                                ? <Check className="h-3.5 w-3.5 ml-1 text-green-600" />
                                : <Copy className="h-3.5 w-3.5 ml-1" />
                              }
                              קישור
                            </Button>
                            <Button
                              asChild
                              size="sm"
                              variant="outline"
                              title="פתח דוח לקוח בכרטיסייה חדשה"
                            >
                              <a
                                href={`${REPORT_BASE}/r/${u.company.report_token}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <Link2 className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          </>
                        )}
                        {/* Impersonate button */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => impersonate(u)}
                          disabled={impersonating === u.id}
                        >
                          {impersonating === u.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                          }
                          התחבר
                        </Button>
                        {/* Delete button */}
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                          onClick={() => setDeleteConfirmUser(u)}
                          disabled={deleting === u.id}
                          title="מחק משתמש"
                        >
                          {deleting === u.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Trash2 className="h-3.5 w-3.5" />
                          }
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── FIX 5: live scan progress modal ── */}
      <ScanProgressModal
        companyId={progressUser?.id ?? null}
        companyName={progressUser?.company?.name || progressUser?.email}
        open={!!progressUser}
        onClose={() => setProgressUser(null)}
      />

      {/* ── Per-module sync dialog ── */}
      <Dialog open={!!moduleSyncUser} onOpenChange={open => { if (!open) setModuleSyncUser(null) }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cpu className="h-4 w-4" />
              סנכרון מודולים — {moduleSyncUser?.company?.name || moduleSyncUser?.email}
            </DialogTitle>
          </DialogHeader>

          {moduleSyncUser && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                לחץ על מודול להרצה בנפרד. כל לחיצה קוראת ל-API עם force=true.
              </p>
              <div className="grid grid-cols-3 gap-2">
                {SYNC_MODULES.map(mod => {
                  const state: ModuleState = moduleStates[moduleSyncUser.id]?.[mod.id] ?? 'idle'
                  return (
                    <ModuleButton
                      key={mod.id}
                      state={state}
                      emoji={mod.emoji}
                      label={mod.label}
                      onClick={() => syncModule(moduleSyncUser.id, mod.id)}
                      disabled={false}
                    />
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                ✅ = הצליח · ❌ = שגיאה · ⟳ = רץ · האייקון המקורי = ממתין
              </p>

              {/* ── GEO queries editor ── */}
              <div className="border-t pt-4 space-y-3">
                <div>
                  <p className="text-sm font-semibold flex items-center gap-2">
                    🌐 שאלות GEO
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    שאלות בשפה טבעית שנשלחות ל-ChatGPT/Gemini כדי לבדוק אם העסק מוזכר. נוצרות אוטומטית בסריקה הראשונה ונשמרות — כאן ניתן לערוך ידנית.
                  </p>
                </div>

                {geoQueriesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> טוען...
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      {geoQueries.length === 0 ? (
                        <p className="text-xs text-muted-foreground">אין שאלות GEO עדיין — יווצרו בסריקת GEO הבאה, או הוסף ידנית.</p>
                      ) : (
                        geoQueries.map((q, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <Input
                              value={q}
                              onChange={e => setGeoQueries(prev => prev.map((x, idx) => idx === i ? e.target.value : x))}
                              className="text-sm"
                              dir="rtl"
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 shrink-0 text-destructive"
                              onClick={() => setGeoQueries(prev => prev.filter((_, idx) => idx !== i))}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="הוסף שאלה חדשה..."
                        value={newGeoQuery}
                        onChange={e => setNewGeoQuery(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && newGeoQuery.trim().length >= 3) {
                            setGeoQueries(prev => [...prev, newGeoQuery.trim()])
                            setNewGeoQuery("")
                          }
                        }}
                        className="text-sm"
                        dir="rtl"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        disabled={newGeoQuery.trim().length < 3}
                        onClick={() => { setGeoQueries(prev => [...prev, newGeoQuery.trim()]); setNewGeoQuery("") }}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>

                    <Button
                      size="sm"
                      onClick={saveGeoQueries}
                      disabled={geoQueriesSaving}
                      className="w-full"
                    >
                      {geoQueriesSaving
                        ? <Loader2 className="h-4 w-4 animate-spin ml-2" />
                        : <Save className="h-4 w-4 ml-2" />}
                      שמור שאלות GEO
                    </Button>
                  </>
                )}
              </div>

              {/* ── Distribution channels editor ── */}
              <div className="border-t pt-4 space-y-3">
                <div>
                  <p className="text-sm font-semibold flex items-center gap-2">
                    🚚 ערוצי הפצה
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    ערוצי ההפצה של העסק. נוצרים בהרשמה ואינם מתרעננים בסריקות — כאן ניתן לערוך ידנית (הוספה/הסרה/החלפה). הלקוח יכול להסיר ערוצים בהגדרות.
                  </p>
                </div>

                {distChannelsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> טוען...
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      {distChannels.length === 0 ? (
                        <p className="text-xs text-muted-foreground">אין ערוצי הפצה — הוסף ידנית.</p>
                      ) : (
                        distChannels.map((c, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <Input
                              value={c}
                              onChange={e => setDistChannels(prev => prev.map((x, idx) => idx === i ? e.target.value : x))}
                              className="text-sm"
                              dir="rtl"
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 shrink-0 text-destructive"
                              onClick={() => setDistChannels(prev => prev.filter((_, idx) => idx !== i))}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="הוסף ערוץ חדש..."
                        value={newDistChannel}
                        onChange={e => setNewDistChannel(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && newDistChannel.trim().length >= 1) {
                            setDistChannels(prev => [...prev, newDistChannel.trim()])
                            setNewDistChannel("")
                          }
                        }}
                        className="text-sm"
                        dir="rtl"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        disabled={newDistChannel.trim().length < 1}
                        onClick={() => { setDistChannels(prev => [...prev, newDistChannel.trim()]); setNewDistChannel("") }}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>

                    <Button
                      size="sm"
                      onClick={saveDistChannels}
                      disabled={distChannelsSaving}
                      className="w-full"
                    >
                      {distChannelsSaving
                        ? <Loader2 className="h-4 w-4 animate-spin ml-2" />
                        : <Save className="h-4 w-4 ml-2" />}
                      שמור ערוצי הפצה
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── דוח לקוח: קישור קבוע + היסטוריית ארכיון + צור דוח עדכני ── */}
          {moduleSyncUser && (
            <div className="mt-4 border-t pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  היסטוריית דוחות
                </h4>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={regenActions}
                      onChange={(e) => setRegenActions(e.target.checked)}
                      className="h-3.5 w-3.5 accent-teal-600"
                    />
                    רענן גם המלצות
                  </label>
                  <Button
                    size="sm"
                    onClick={generateFreshReport}
                    disabled={generatingReport}
                  >
                    {generatingReport
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin ml-1.5" />
                      : <Plus className="h-3.5 w-3.5 ml-1.5" />}
                    צור דוח עדכני
                  </Button>
                </div>
              </div>
              {regenActions && (
                <p className="text-[11px] text-amber-600 -mt-1">רענון המלצות מבצע קריאת מודל אחת (איטי יותר) ומעדכן את "מה לעשות השבוע" לפי הנתונים העדכניים, ללא פריטים מוסתרים.</p>
              )}

              {/* Permanent live report link */}
              {moduleSyncUser.company?.report_token && (
                <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
                  <span className="font-medium shrink-0">קישור קבוע:</span>
                  <span className="truncate text-muted-foreground" dir="ltr">
                    {REPORT_BASE}/r/{moduleSyncUser.company.report_token}
                  </span>
                  <div className="mr-auto flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => copyLink(`${REPORT_BASE}/r/${moduleSyncUser.company!.report_token}`, 'perm')}
                      title="העתק קישור קבוע"
                    >
                      {copiedToken === 'perm'
                        ? <Check className="h-3.5 w-3.5 text-green-600" />
                        : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                    <Button asChild size="sm" variant="ghost" className="h-7 w-7 p-0" title="פתח">
                      <a href={`${REPORT_BASE}/r/${moduleSyncUser.company.report_token}`} target="_blank" rel="noopener noreferrer">
                        <Link2 className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  </div>
                </div>
              )}

              {/* Archive snapshots — newest first */}
              {reportSnapshotsLoading ? (
                <div className="flex items-center justify-center py-3 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin ml-2" />
                  טוען היסטוריה...
                </div>
              ) : reportSnapshots.length === 0 ? (
                <p className="py-2 text-center text-xs text-muted-foreground">
                  אין דוחות בארכיון עדיין. יווצר אוטומטית בסיום סריקה, או לחץ "צור דוח עדכני".
                </p>
              ) : (
                <div className="max-h-56 space-y-1.5 overflow-y-auto">
                  {reportSnapshots.map(s => {
                    const label = s.label || (s.created_at ? new Date(s.created_at).toLocaleDateString('he-IL') : '')
                    const url = `${REPORT_BASE}/r/a/${s.snapshot_token}`
                    return (
                      <div key={s.id} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs">
                        <span className="font-medium">📁 {label}</span>
                        <div className="mr-auto flex shrink-0 items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => copyLink(url, s.snapshot_token)}
                            title="העתק קישור ארכיון"
                          >
                            {copiedToken === s.snapshot_token
                              ? <Check className="h-3.5 w-3.5 text-green-600" />
                              : <Copy className="h-3.5 w-3.5" />}
                          </Button>
                          <Button asChild size="sm" variant="ghost" className="h-7 w-7 p-0" title="פתח דוח ארכיון">
                            <a href={url} target="_blank" rel="noopener noreferrer">
                              <Link2 className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setModuleSyncUser(null)}>סגור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Sync Log Details Modal ── */}
      <Dialog open={!!logModalUser} onOpenChange={open => { if (!open) setLogModalUser(null) }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              פרטי סנכרון — {logModalUser?.company?.name || logModalUser?.email}
            </DialogTitle>
          </DialogHeader>

          {logModalUser && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground ml-1">סטטוס:</span>
                  <SyncStatusBadge status={logModalUser.company?.sync_status ?? null} />
                </div>
                {logModalUser.company?.last_sync_at && (
                  <div>
                    <span className="text-muted-foreground ml-1">עודכן לאחרונה:</span>
                    <span className="font-medium">
                      {new Date(logModalUser.company.last_sync_at).toLocaleString('he-IL')}
                    </span>
                  </div>
                )}
                {logModalUser.company?.next_sync_at && (
                  <div>
                    <span className="text-muted-foreground ml-1">עדכון הבא:</span>
                    <span className="font-medium">
                      {new Date(logModalUser.company.next_sync_at).toLocaleString('he-IL')}
                    </span>
                  </div>
                )}
              </div>

              {logModalUser.company?.sync_log && logModalUser.company.sync_log.length > 0 ? (
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead className="text-right">מודול</TableHead>
                        <TableHead className="text-right">סטטוס</TableHead>
                        <TableHead className="text-right hidden sm:table-cell">זמן (ms)</TableHead>
                        <TableHead className="text-right">הודעה</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logModalUser.company.sync_log.map((entry, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium text-sm">{entry.module}</TableCell>
                          <TableCell>
                            {entry.status === 'ok'
                              ? <span className="flex items-center gap-1 text-green-600"><CheckCircle2 className="h-3.5 w-3.5" />הצלחה</span>
                              : entry.status === 'error'
                                ? <span className="flex items-center gap-1 text-red-500"><XCircle className="h-3.5 w-3.5" />שגיאה</span>
                                : <span className="flex items-center gap-1 text-muted-foreground"><Minus className="h-3.5 w-3.5" />דולג</span>
                            }
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm hidden sm:table-cell">
                            {entry.duration_ms != null ? `${entry.duration_ms}ms` : '—'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                            {entry.error || entry.message || '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
                  אין יומן סנכרון זמין עדיין
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setLogModalUser(null)}>סגור</Button>
            {logModalUser && (
              <Button
                onClick={() => {
                  triggerSync(logModalUser.id)
                  setLogModalUser(null)
                }}
                disabled={logModalUser.company?.sync_status === 'running' || pollingUsers.has(logModalUser.id)}
              >
                <RefreshCw className="ml-2 h-4 w-4" />
                סנכרן עכשיו
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Content management — admin soft-hide (impersonate only) ── */}
      <Dialog open={!!contentUser} onOpenChange={open => { if (!open) setContentUser(null) }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <EyeOff className="h-5 w-5" />
              ניהול תוכן — {contentUser?.company?.name || contentUser?.email}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              הסתרת פריטים מתצוגת הלקוח. הפריט נעלם מהאתר, מהדוח ומהסריקות הבאות — הלקוח לא רואה דבר. ניתן לשחזר בכל עת.
            </p>
          </DialogHeader>

          {contentLoading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin ml-2" />
              טוען תוכן...
            </div>
          ) : (
            <div className="space-y-4">
              {/* Hidden items block */}
              {hiddenItems.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3">
                  <h4 className="mb-2 text-sm font-semibold text-amber-900">
                    פריטים מוסתרים ({hiddenItems.length})
                  </h4>
                  <div className="space-y-1.5">
                    {HIDE_TYPE_ORDER.map(type => {
                      const group = hiddenItems.filter(h => h.item_type === type)
                      if (!group.length) return null
                      return (
                        <div key={type}>
                          <div className="text-[11px] font-medium text-amber-700">{HIDE_TYPE_LABELS[type]}</div>
                          {group.map(h => (
                            <div key={h.id} className="flex items-center gap-2 py-0.5 text-xs">
                              <span className="truncate">{h.label || h.item_key}</span>
                              {h.reason && <span className="truncate text-muted-foreground">· {h.reason}</span>}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="mr-auto h-6 shrink-0 px-2 text-xs"
                                disabled={hidingKey === h.id}
                                onClick={() => restoreHidden(h.id)}
                              >
                                {hidingKey === h.id
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <><RotateCcw className="h-3 w-3 ml-1" />שחזר</>}
                              </Button>
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Live items per type — each with a הסתר action */}
              {clientItems && HIDE_TYPE_ORDER.map(type => {
                const items = clientItems[type] || []
                if (!items.length) return null
                return (
                  <div key={type}>
                    <h4 className="mb-1.5 text-sm font-semibold">{HIDE_TYPE_LABELS[type]} ({items.length})</h4>
                    <div className="space-y-1">
                      {items.map((it, i) => {
                        const busy = hidingKey === `${type}:${it.label}`
                        return (
                          <div key={`${type}-${i}`} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs">
                            <span className="truncate font-medium">{it.label}</span>
                            {it.sub && <span className="truncate text-muted-foreground">· {it.sub}</span>}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="mr-auto h-6 shrink-0 px-2 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                              disabled={busy}
                              onClick={() => hideItem(type, it.label)}
                            >
                              {busy
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <><EyeOff className="h-3 w-3 ml-1" />הסתר</>}
                            </Button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}

              {clientItems && HIDE_TYPE_ORDER.every(t => !(clientItems[t] || []).length) && hiddenItems.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">אין פריטים להצגה עדיין (הרץ סריקה).</p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setContentUser(null)}>סגור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Snapshots / restore ── */}
      <Dialog open={!!snapshotUser} onOpenChange={open => { if (!open) setSnapshotUser(null) }}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              גיבויים — {snapshotUser?.company?.name || snapshotUser?.email}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {snapshotsLoading ? (
              <div className="flex items-center justify-center p-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin ml-2" /> טוען גיבויים...
              </div>
            ) : snapshots.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
                אין גיבויים זמינים עדיין
              </div>
            ) : (
              snapshots.map((s: any) => (
                <div key={s.id} className="rounded-lg border p-3 flex items-center justify-between gap-3">
                  <div className="text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{s.trigger}</Badge>
                      <span className="text-muted-foreground">
                        {new Date(s.created_at).toLocaleString('he-IL')}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {s.counts && Object.entries(s.counts)
                        .map(([k, v]) => `${k}: ${v}`).join(' · ')}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => restoreSnapshot(snapshotUser!.id, s.id)}
                    disabled={restoringId === s.id}
                  >
                    {restoringId === s.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin ml-1" />
                      : <RotateCcw className="h-3.5 w-3.5 ml-1" />
                    }
                    שחזר
                  </Button>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSnapshotUser(null)}>סגור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete user confirmation ── */}
      <Dialog open={!!deleteConfirmUser} onOpenChange={open => { if (!open) setDeleteConfirmUser(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              מחיקת משתמש
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              האם אתה בטוח שברצונך למחוק את המשתמש{' '}
              <strong className="font-mono">{deleteConfirmUser?.email}</strong>?
            </p>
            <p className="text-muted-foreground">
              פעולה זו תמחק את המשתמש ואת כל נתוני החברה שלו לצמיתות ואינה ניתנת לביטול.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteConfirmUser(null)}>בטל</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmUser && deleteUser(deleteConfirmUser)}
            >
              <Trash2 className="ml-2 h-4 w-4" />
              מחק לצמיתות
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirm Refresh All ── */}
      <Dialog open={showConfirmAll} onOpenChange={setShowConfirmAll}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>רענון כל המשתמשים</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            פעולה זו תפעיל סריקה מלאה (מתחרים, SEO, GEO, מגמות) עבור כל{' '}
            <strong>{users.length} המשתמשים</strong>. הפעולה עשויה לקחת מספר דקות.
          </p>
          <p className="text-sm font-medium">האם להמשיך?</p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowConfirmAll(false)}>ביטול</Button>
            <Button onClick={refreshAllUsers}>
              <RefreshCw className="ml-2 h-4 w-4" />
              כן, רענן הכל
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
