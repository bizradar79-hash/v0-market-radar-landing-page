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
import {
  Loader2, ShieldCheck, ExternalLink, Building2, RefreshCw,
  CheckCircle2, XCircle, FileText, Minus, Trash2,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

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
  } | null
}

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
  // idle or null
  return <Badge className="bg-gray-100 text-gray-500 border-gray-200 text-xs">— ממתין</Badge>
}

export default function ImpersonatePage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [impersonating, setImpersonating] = useState<string | null>(null)

  // Per-user sync trigger state (while waiting for running status to appear)
  const [triggering, setTriggering] = useState<Record<string, boolean>>({})
  // Polling: set of user IDs currently in 'running' state
  const [pollingUsers, setPollingUsers] = useState<Set<string>>(new Set())

  // Delete user
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<UserRow | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  // Refresh All
  const [refreshingAll, setRefreshingAll] = useState(false)
  const [refreshAllProgress, setRefreshAllProgress] = useState(0)
  const [showConfirmAll, setShowConfirmAll] = useState(false)

  // Details modal
  const [logModalUser, setLogModalUser] = useState<UserRow | null>(null)

  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    checkAdminAndLoad()
  }, [])

  // Poll Supabase for sync_status updates every 5s when any user is running
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

      // Remove users that are no longer running
      const stillRunning = new Set(
        data
          .filter(d => d.sync_status === 'running')
          .map(d => d.id)
      )
      setPollingUsers(stillRunning)

      // Show toast for completed users
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
      // Start polling for any already-running syncs
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

  async function triggerSync(userId: string) {
    setTriggering(prev => ({ ...prev, [userId]: true }))
    try {
      // Optimistically set status to running in UI
      setUsers(prev => prev.map(u => u.id === userId && u.company
        ? { ...u, company: { ...u.company, sync_status: 'running' } }
        : u
      ))
      // Fire-and-forget
      fetch('/api/sync/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: userId, force: true }),
      }).catch(() => {})
      // Start polling this user
      setPollingUsers(prev => new Set([...prev, userId]))
    } catch (e: any) {
      toast({ title: "שגיאה", description: e?.message, variant: "destructive" })
    } finally {
      setTriggering(prev => ({ ...prev, [userId]: false }))
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
        // Optimistically mark as running
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
                      <div className="flex items-center gap-2">
                        {/* Sync button */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => triggerSync(u.id)}
                          disabled={isTriggering || isRunning || refreshingAll}
                          title="סנכרן עכשיו"
                        >
                          {isTriggering || isRunning
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <RefreshCw className="h-3.5 w-3.5" />
                          }
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

      {/* Sync Log Details Modal */}
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
              {/* Status + dates */}
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

              {/* Log table */}
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

      {/* Delete user confirmation dialog */}
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

      {/* Confirm Refresh All dialog */}
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
