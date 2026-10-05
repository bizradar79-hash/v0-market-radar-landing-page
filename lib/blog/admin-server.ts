// Server-side helpers for the admin blog API: the admin gate, the service-role
// client, and payload validation. Every blog write goes through here.

import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@/lib/supabase/server'
import { sanitizeArticleHtml, htmlToText } from './sanitize'
import { slugify, isValidSlug } from './posts'

export function blogAdminDb() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

/** Returns a response to send back if the caller is NOT an admin, else null. */
export async function requireBlogAdmin(): Promise<NextResponse | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'לא מחובר' }, { status: 401 })
  const { data: role } = await supabase
    .from('user_roles').select('is_admin').eq('user_id', user.id).single()
  if (!role?.is_admin) return NextResponse.json({ error: 'אין הרשאת אדמין' }, { status: 403 })
  return null
}

export interface BlogWrite {
  title: string
  slug: string
  content: string
  excerpt: string | null
  cover_image_url: string | null
  meta_description: string | null
  published: boolean
  published_at: string | null
}

const httpUrl = (v: unknown): string | null => {
  const s = String(v ?? '').trim()
  if (!s) return null
  try {
    const u = new URL(s)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch { return null }
}

/**
 * Validate + normalize an editor payload into the exact columns we store.
 * Explicit column mapping (never spread the request body into an insert), and
 * the content is sanitized HERE so stored HTML is already safe.
 */
export function normalizeBlogWrite(body: any): { ok: true; value: BlogWrite } | { ok: false; error: string } {
  const title = String(body?.title ?? '').replace(/\s+/g, ' ').trim()
  if (!title) return { ok: false, error: 'חובה למלא כותרת' }
  if (title.length > 200) return { ok: false, error: 'הכותרת ארוכה מדי (עד 200 תווים)' }

  const rawSlug = String(body?.slug ?? '').trim()
  const slug = rawSlug ? slugify(rawSlug) : slugify(title)
  if (!isValidSlug(slug)) return { ok: false, error: 'כתובת ה-URL (slug) לא תקינה' }

  const content = sanitizeArticleHtml(body?.content)

  const excerptIn = String(body?.excerpt ?? '').replace(/\s+/g, ' ').trim()
  // No excerpt given → derive one from the body so the list page isn't blank.
  const excerpt = (excerptIn || htmlToText(content).slice(0, 220)).slice(0, 300) || null

  const meta = String(body?.meta_description ?? '').replace(/\s+/g, ' ').trim().slice(0, 300) || null

  const published = body?.published === true
  let published_at: string | null = null
  if (body?.published_at) {
    const t = Date.parse(String(body.published_at))
    if (Number.isNaN(t)) return { ok: false, error: 'תאריך הפרסום לא תקין' }
    published_at = new Date(t).toISOString()
  }
  // Publishing without a date means "now" — a published post must have a date
  // for ordering and for the article's datePublished.
  if (published && !published_at) published_at = new Date().toISOString()

  return {
    ok: true,
    value: {
      title,
      slug,
      content,
      excerpt,
      cover_image_url: httpUrl(body?.cover_image_url),
      meta_description: meta,
      published,
      published_at,
    },
  }
}

/** Refresh the cached public pages a write can affect. Best-effort. */
export function revalidateBlog(...slugs: string[]) {
  try {
    revalidatePath('/blog')
    revalidatePath('/sitemap.xml')
    for (const s of slugs) if (s) revalidatePath(`/blog/${s}`)
  } catch { /* never fail a write over cache invalidation */ }
}
