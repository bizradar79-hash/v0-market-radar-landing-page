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
import { Loader2, ShieldCheck, ExternalLink, Building2, RefreshCw, CheckCircle2, XCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface UserRow {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
  company: {
    name: string
    industry: string
    website: string
  } | null
}

export default function ImpersonatePage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [impersonating, setImpersonating] = useState<string | null>(null)

  // Refresh state
  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({})
  const [refreshResult, setRefreshResult] = useState<Record<string, 'success' | 'error'>>({})
  const [refreshingAll, setRefreshingAll] = useState(false)
  const [showConfirmAll, setShowConfirmAll] = useState(false)

  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    checkAdminAndLoad()
  }, [])

  async function checkAdminAndLoad() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }

    const { data: role } = await supabase
      .from('user_roles').select('is_admin').eq('user_id', user.id).single()
    if (!role?.is_admin) { router.replace('/app/dashboard'); return }

    const res = await fetch('/api/admin/generate-magic-link?list=1')
    const data = await res.json()
    if (data.users) setUsers(data.users)
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

  async function refreshUser(userId: string) {
    setRefreshing(prev => ({ ...prev, [userId]: true }))
    setRefreshResult(prev => { const n = { ...prev }; delete n[userId]; return n })
    try {
      const res = await fetch('/api/admin/refresh-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const data = await res.json()
      const ok = res.ok && data.success
      setRefreshResult(prev => ({ ...prev, [userId]: ok ? 'success' : 'error' }))
      toast({
        title: ok ? "סריקה הושלמה" : "שגיאה בסריקה",
        description: ok
          ? "מתחרים, SEO, GEO ומגמות עודכנו"
          : data.results?.[userId]?.error || data.error || "אירעה שגיאה",
        variant: ok ? "default" : "destructive",
      })
    } catch (e: any) {
      setRefreshResult(prev => ({ ...prev, [userId]: 'error' }))
      toast({ title: "שגיאה", description: e?.message, variant: "destructive" })
    } finally {
      setRefreshing(prev => ({ ...prev, [userId]: false }))
    }
  }

  async function refreshAllUsers() {
    setShowConfirmAll(false)
    setRefreshingAll(true)
    const allIds = users.map(u => u.id)
    // Clear previous results
    setRefreshResult({})
    try {
      const res = await fetch('/api/admin/refresh-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: allIds }),
      })
      const data = await res.json()
      // Apply per-user results
      if (data.results) {
        const mapped: Record<string, 'success' | 'error'> = {}
        for (const [uid, r] of Object.entries(data.results as Record<string, { ok: boolean }>)) {
          mapped[uid] = r.ok ? 'success' : 'error'
        }
        setRefreshResult(mapped)
      }
      const succeeded = Object.values(data.results || {}).filter((r: any) => r.ok).length
      toast({
        title: data.success ? "סריקה הושלמה לכולם" : "סריקה הושלמה חלקית",
        description: `${succeeded} מתוך ${allIds.length} משתמשים עודכנו בהצלחה`,
        variant: data.success ? "default" : "destructive",
      })
    } catch (e: any) {
      toast({ title: "שגיאה", description: e?.message, variant: "destructive" })
    } finally {
      setRefreshingAll(false)
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
            <h1 className="text-2xl font-bold">התחזות למשתמשים</h1>
            <p className="text-muted-foreground">{users.length} משתמשים רשומים</p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => setShowConfirmAll(true)}
          disabled={refreshingAll || users.length === 0}
        >
          {refreshingAll
            ? <><Loader2 className="ml-2 h-4 w-4 animate-spin" />מרענן הכל...</>
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
                <TableHead className="text-right hidden md:table-cell">תחום</TableHead>
                <TableHead className="text-right hidden lg:table-cell">כניסה אחרונה</TableHead>
                <TableHead className="text-right">פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <span className="font-mono text-sm">{u.email}</span>
                  </TableCell>
                  <TableCell>
                    {u.company ? (
                      <div className="flex items-center gap-2">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="font-medium">{u.company.name}</span>
                      </div>
                    ) : (
                      <Badge variant="outline" className="text-xs text-muted-foreground">אין חברה</Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="text-sm text-muted-foreground">{u.company?.industry || '—'}</span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <span className="text-sm text-muted-foreground">
                      {u.last_sign_in_at
                        ? new Date(u.last_sign_in_at).toLocaleDateString('he-IL')
                        : '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {/* Refresh button */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => refreshUser(u.id)}
                        disabled={refreshing[u.id] || refreshingAll}
                        title="סרוק מחדש: מתחרים, SEO, GEO, מגמות"
                      >
                        {refreshing[u.id]
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : refreshResult[u.id] === 'success'
                            ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                            : refreshResult[u.id] === 'error'
                              ? <XCircle className="h-3.5 w-3.5 text-red-500" />
                              : <RefreshCw className="h-3.5 w-3.5" />
                        }
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
                        התחבר בשמו
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
