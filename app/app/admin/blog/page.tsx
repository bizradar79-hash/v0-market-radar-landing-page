"use client"

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import {
  Loader2, Plus, Pencil, Trash2, ExternalLink, ChevronUp, ChevronDown, GripVertical, Save, RotateCcw, Newspaper,
} from "lucide-react"
import { formatHebrewDate, isPubliclyVisible } from "@/lib/blog/posts"

interface PostRow {
  id: string
  title: string
  slug: string
  excerpt: string | null
  cover_image_url: string | null
  published: boolean
  published_at: string | null
  sort_order: number | null
  updated_at: string
}

function StatusBadge({ p }: { p: PostRow }) {
  if (!p.published) return <Badge variant="outline" className="text-muted-foreground">טיוטה</Badge>
  if (!isPubliclyVisible(p)) return <Badge className="bg-amber-100 text-amber-800 border-amber-200">מתוזמן</Badge>
  return <Badge className="bg-green-100 text-green-700 border-green-200">פורסם</Badge>
}

export default function AdminBlogPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [authorized, setAuthorized] = useState(false)
  const [posts, setPosts] = useState<PostRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Local order the admin is arranging; saved explicitly with "שמור סדר".
  const [orderDirty, setOrderDirty] = useState(false)
  const [savingOrder, setSavingOrder] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  // UI gate (the API enforces admin on every request regardless).
  useEffect(() => {
    (async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data: role } = await supabase.from('user_roles').select('is_admin').eq('user_id', user.id).single()
      if (!role?.is_admin) { router.replace('/app/dashboard'); return }
      setAuthorized(true)
    })()
  }, [router])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/admin/blog')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setPosts(data.posts || [])
      setOrderDirty(false)
    } catch (e: any) {
      setLoadError(e?.message || 'שגיאה בטעינה')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (authorized) load() }, [authorized, load])

  function move(from: number, to: number) {
    if (to < 0 || to >= posts.length || from === to) return
    setPosts(prev => {
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
    setOrderDirty(true)
  }

  async function saveOrder() {
    setSavingOrder(true)
    try {
      const res = await fetch('/api/admin/blog/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: posts.map(p => p.id) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      toast({ title: '✅ הסדר נשמר', description: 'המאמרים יוצגו בבלוג בסדר הזה' })
      await load()
    } catch (e: any) {
      toast({ title: '❌ שמירת הסדר נכשלה', description: e?.message, variant: 'destructive' })
    } finally {
      setSavingOrder(false)
    }
  }

  async function resetOrder() {
    if (!window.confirm('לבטל את הסידור הידני ולחזור לסדר לפי תאריך פרסום?')) return
    setSavingOrder(true)
    try {
      const res = await fetch('/api/admin/blog/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      toast({ title: '✅ חזרנו לסדר לפי תאריך' })
      await load()
    } catch (e: any) {
      toast({ title: '❌ הפעולה נכשלה', description: e?.message, variant: 'destructive' })
    } finally {
      setSavingOrder(false)
    }
  }

  async function remove(p: PostRow) {
    if (!window.confirm(`למחוק לצמיתות את "${p.title}"?\nאי אפשר לשחזר את המאמר.`)) return
    setDeleting(p.id)
    try {
      const res = await fetch(`/api/admin/blog/${p.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      toast({ title: '🗑️ המאמר נמחק' })
      setPosts(prev => prev.filter(x => x.id !== p.id))
    } catch (e: any) {
      toast({ title: '❌ המחיקה נכשלה', description: e?.message, variant: 'destructive' })
    } finally {
      setDeleting(null)
    }
  }

  if (!authorized) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
  }

  const anyManual = posts.some(p => p.sort_order != null)

  return (
    <div className="space-y-6 p-4 md:p-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Newspaper className="h-6 w-6" />בלוג</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            מאמרים ל-SEO ב-<a href="/blog" target="_blank" rel="noopener noreferrer" className="underline">/blog</a>.
            {' '}ברירת המחדל: לפי תאריך פרסום (החדש למעלה). גרירה או חיצים קובעים סדר ידני.
          </p>
        </div>
        <Button asChild>
          <Link href="/app/admin/blog/new"><Plus className="ml-1 h-4 w-4" />מאמר חדש</Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">
            {posts.length} מאמרים
            <span className="mr-2 text-xs font-normal text-muted-foreground">
              {anyManual ? '· סדר ידני' : '· סדר לפי תאריך'}
            </span>
          </CardTitle>
          <div className="flex gap-2">
            {orderDirty && (
              <Button size="sm" onClick={saveOrder} disabled={savingOrder}>
                {savingOrder ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : <Save className="ml-1 h-4 w-4" />}
                שמור סדר
              </Button>
            )}
            {anyManual && !orderDirty && (
              <Button size="sm" variant="outline" onClick={resetOrder} disabled={savingOrder}>
                <RotateCcw className="ml-1 h-4 w-4" />חזור לסדר לפי תאריך
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : loadError ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <p className="font-semibold">לא ניתן לטעון את המאמרים</p>
              <p className="mt-1">{loadError}</p>
            </div>
          ) : posts.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">עדיין אין מאמרים. צור את הראשון.</p>
          ) : (
            <ul className="divide-y" aria-label="רשימת מאמרים — ניתן לסדר מחדש">
              {posts.map((p, i) => (
                <li
                  key={p.id}
                  draggable
                  onDragStart={() => setDragIndex(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { if (dragIndex != null) move(dragIndex, i); setDragIndex(null) }}
                  onDragEnd={() => setDragIndex(null)}
                  className={`flex items-center gap-3 py-3 ${dragIndex === i ? 'opacity-40' : ''}`}
                >
                  <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" aria-hidden />
                  <div className="flex shrink-0 flex-col">
                    <button
                      type="button" aria-label={`הזז למעלה: ${p.title}`} disabled={i === 0}
                      onClick={() => move(i, i - 1)}
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
                    ><ChevronUp className="h-4 w-4" /></button>
                    <button
                      type="button" aria-label={`הזז למטה: ${p.title}`} disabled={i === posts.length - 1}
                      onClick={() => move(i, i + 1)}
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
                    ><ChevronDown className="h-4 w-4" /></button>
                  </div>

                  {p.cover_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.cover_image_url} alt="" className="hidden h-12 w-20 shrink-0 rounded object-cover sm:block" />
                  ) : (
                    <div className="hidden h-12 w-20 shrink-0 rounded bg-muted sm:block" aria-hidden />
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{p.title}</span>
                      <StatusBadge p={p} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground" dir="ltr">/blog/{p.slug}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.published_at ? formatHebrewDate(p.published_at) : 'ללא תאריך'}
                      {p.sort_order != null && <span className="mr-2">· מיקום ידני {p.sort_order}</span>}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {isPubliclyVisible(p) && (
                      <Button asChild size="sm" variant="ghost" title="צפה במאמר באתר">
                        <a href={`/blog/${encodeURIComponent(p.slug)}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a>
                      </Button>
                    )}
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/app/admin/blog/${p.id}`}><Pencil className="ml-1 h-3.5 w-3.5" />עריכה</Link>
                    </Button>
                    <Button
                      size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => remove(p)} disabled={deleting === p.id} aria-label={`מחק: ${p.title}`}
                    >
                      {deleting === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {orderDirty && (
            <p className="mt-3 text-xs text-amber-700">הסדר השתנה — לחץ "שמור סדר" כדי לעדכן את הבלוג.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
