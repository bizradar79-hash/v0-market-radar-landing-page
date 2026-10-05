"use client"

export const dynamic = 'force-dynamic'

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { Loader2, ArrowRight, Save, Trash2, ExternalLink, ImagePlus, X } from "lucide-react"
import { RichEditor } from "@/components/blog/rich-editor"
import { isPubliclyVisible } from "@/lib/blog/posts"

interface Draft {
  id: string | null
  title: string
  slug: string
  excerpt: string
  meta_description: string
  cover_image_url: string
  content: string
  published: boolean
  published_at: string | null
}

const EMPTY: Draft = {
  id: null, title: '', slug: '', excerpt: '', meta_description: '',
  cover_image_url: '', content: '', published: false, published_at: null,
}

/** ISO → value for <input type="datetime-local"> in the admin's local time. */
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function uploadImage(file: File): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch('/api/admin/blog/upload', { method: 'POST', body: fd })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data.url as string
}

export default function AdminBlogEditorPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { toast } = useToast()
  const isNew = params.id === 'new'

  const [authorized, setAuthorized] = useState(false)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [loaded, setLoaded] = useState(isNew)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [savedSlug, setSavedSlug] = useState<string | null>(null)
  const coverInput = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    if (!authorized || isNew) return
    (async () => {
      try {
        const res = await fetch(`/api/admin/blog/${params.id}`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
        const p = data.post
        setDraft({
          id: p.id, title: p.title || '', slug: p.slug || '', excerpt: p.excerpt || '',
          meta_description: p.meta_description || '', cover_image_url: p.cover_image_url || '',
          content: p.content || '', published: !!p.published, published_at: p.published_at,
        })
        setSavedSlug(p.published && isPubliclyVisible(p) ? p.slug : null)
        setLoaded(true)
      } catch (e: any) {
        setLoadError(e?.message || 'שגיאה בטעינה')
      }
    })()
  }, [authorized, isNew, params.id])

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft(d => ({ ...d, [k]: v }))

  async function save() {
    if (!draft.title.trim()) {
      toast({ title: 'חסרה כותרת', description: 'לכל מאמר חייבת להיות כותרת', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const body = {
        title: draft.title, slug: draft.slug, excerpt: draft.excerpt,
        meta_description: draft.meta_description, cover_image_url: draft.cover_image_url || null,
        content: draft.content, published: draft.published, published_at: draft.published_at,
      }
      const res = await fetch(draft.id ? `/api/admin/blog/${draft.id}` : '/api/admin/blog', {
        method: draft.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      const p = data.post
      // Reflect server-side normalisation (generated slug, derived excerpt, date).
      setDraft(d => ({
        ...d, id: p.id, slug: p.slug, excerpt: p.excerpt || '', published_at: p.published_at,
        meta_description: p.meta_description || '',
      }))
      setSavedSlug(p.published && isPubliclyVisible(p) ? p.slug : null)
      toast({
        title: '✅ המאמר נשמר',
        description: p.published ? (isPubliclyVisible(p) ? 'המאמר מפורסם בבלוג' : 'המאמר מתוזמן לפרסום') : 'נשמר כטיוטה',
      })
      if (!draft.id) router.replace(`/app/admin/blog/${p.id}`)
    } catch (e: any) {
      toast({ title: '❌ השמירה נכשלה', description: e?.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!draft.id) return
    if (!window.confirm(`למחוק לצמיתות את "${draft.title}"?`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/blog/${draft.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      toast({ title: '🗑️ המאמר נמחק' })
      router.push('/app/admin/blog')
    } catch (e: any) {
      toast({ title: '❌ המחיקה נכשלה', description: e?.message, variant: 'destructive' })
      setDeleting(false)
    }
  }

  async function onCover(file: File) {
    setUploadingCover(true)
    try {
      set('cover_image_url', await uploadImage(file))
    } catch (e: any) {
      toast({ title: '❌ העלאת התמונה נכשלה', description: e?.message, variant: 'destructive' })
    } finally {
      setUploadingCover(false)
      if (coverInput.current) coverInput.current.value = ''
    }
  }

  if (!authorized || (!loaded && !loadError)) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
  }

  if (loadError) {
    return (
      <div className="space-y-4 p-6" dir="rtl">
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">לא ניתן לטעון את המאמר</p>
          <p className="mt-1">{loadError}</p>
        </div>
        <Link href="/app/admin/blog" className="text-sm underline">חזרה לרשימה</Link>
      </div>
    )
  }

  const metaLen = draft.meta_description.length

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/app/admin/blog"><ArrowRight className="ml-1 h-4 w-4" />כל המאמרים</Link>
          </Button>
          <h1 className="text-xl font-bold">{draft.id ? 'עריכת מאמר' : 'מאמר חדש'}</h1>
        </div>
        <div className="flex items-center gap-2">
          {savedSlug && (
            <Button asChild variant="outline" size="sm">
              <a href={`/blog/${encodeURIComponent(savedSlug)}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="ml-1 h-4 w-4" />צפה באתר
              </a>
            </Button>
          )}
          {draft.id && (
            <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" onClick={remove} disabled={deleting}>
              {deleting ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : <Trash2 className="ml-1 h-4 w-4" />}מחק
            </Button>
          )}
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : <Save className="ml-1 h-4 w-4" />}שמור
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-5 pt-6">
          <div className="space-y-1.5">
            <Label htmlFor="title">כותרת (H1 של העמוד)</Label>
            <Input id="title" value={draft.title} maxLength={200} onChange={e => set('title', e.target.value)} placeholder="למשל: איך לעקוב אחרי מתחרים ב-2026" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="slug">כתובת (slug)</Label>
            <div className="flex items-center gap-2" dir="ltr">
              <span className="text-sm text-muted-foreground">/blog/</span>
              <Input id="slug" value={draft.slug} maxLength={80} onChange={e => set('slug', e.target.value)} placeholder="ייווצר אוטומטית מהכותרת" />
            </div>
            <p className="text-xs text-muted-foreground">השאר ריק כדי ליצור מהכותרת. שינוי כתובת של מאמר שפורסם שובר קישורים קיימים.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="excerpt">תקציר</Label>
            <Textarea id="excerpt" rows={2} maxLength={300} value={draft.excerpt} onChange={e => set('excerpt', e.target.value)} placeholder="מוצג ברשימת המאמרים ומתחת לכותרת. ריק = נגזר מתחילת המאמר." />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="meta">תיאור מטא (Google)</Label>
            <Textarea id="meta" rows={2} maxLength={300} value={draft.meta_description} onChange={e => set('meta_description', e.target.value)} placeholder="ריק = התקציר ישמש כתיאור" />
            <p className={`text-xs ${metaLen > 160 ? 'text-amber-700' : 'text-muted-foreground'}`}>
              {metaLen}/160 תווים{metaLen > 160 ? ' — Google יקצר את הטקסט מעבר ל-160' : ''}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>תמונה ראשית</Label>
            {draft.cover_image_url ? (
              <div className="relative w-full max-w-md">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={draft.cover_image_url} alt="" className="aspect-[16/9] w-full rounded-lg border object-cover" />
                <button type="button" aria-label="הסר תמונה ראשית" onClick={() => set('cover_image_url', '')}
                  className="absolute left-2 top-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <Button type="button" variant="outline" onClick={() => coverInput.current?.click()} disabled={uploadingCover}>
                {uploadingCover ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : <ImagePlus className="ml-1 h-4 w-4" />}
                העלה תמונה (JPG/PNG/WEBP, עד 8MB)
              </Button>
            )}
            <input ref={coverInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) onCover(f) }} />
          </div>

          <div className="flex flex-wrap items-end gap-6 rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center gap-3">
              <Switch id="published" checked={draft.published} onCheckedChange={v => set('published', v)} />
              <Label htmlFor="published">{draft.published ? 'מפורסם' : 'טיוטה'}</Label>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date">תאריך פרסום</Label>
              <Input id="date" type="datetime-local" dir="ltr" className="w-auto"
                value={toLocalInput(draft.published_at)}
                onChange={e => set('published_at', e.target.value ? new Date(e.target.value).toISOString() : null)} />
            </div>
            <p className="text-xs text-muted-foreground">ריק + מפורסם = עכשיו. תאריך עתידי = מתוזמן.</p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-1.5">
        <Label>תוכן המאמר</Label>
        <RichEditor key={draft.id || 'new'} value={draft.content} onChange={html => set('content', html)} onUploadImage={uploadImage} />
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : <Save className="ml-1 h-4 w-4" />}שמור
        </Button>
      </div>
    </div>
  )
}
