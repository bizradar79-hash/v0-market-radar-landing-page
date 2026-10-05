import { NextResponse } from 'next/server'
import { blogAdminDb, requireBlogAdmin, revalidateBlog } from '@/lib/blog/admin-server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Ctx = { params: Promise<{ id: string }> }

/**
 * POST { published: boolean } — one-click "push to production" / "remove from
 * production". Publishing makes the post live NOW: an empty or future date is
 * set to the current time (otherwise the post would stay hidden as scheduled).
 */
export async function POST(request: Request, { params }: Ctx) {
  const denied = await requireBlogAdmin()
  if (denied) return denied
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  if (typeof body?.published !== 'boolean') {
    return NextResponse.json({ error: 'published חייב להיות true/false' }, { status: 400 })
  }

  const db = blogAdminDb()
  const { data: before, error: readErr } = await db
    .from('blog_posts').select('slug, published_at').eq('id', id).maybeSingle()
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  if (!before) return NextResponse.json({ error: 'המאמר לא נמצא' }, { status: 404 })

  const update: Record<string, unknown> = { published: body.published }
  if (body.published) {
    const at = before.published_at ? new Date(before.published_at).getTime() : NaN
    if (isNaN(at) || at > Date.now()) update.published_at = new Date().toISOString()
  }

  const { data, error } = await db
    .from('blog_posts').update(update).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message, code: (error as any).code }, { status: 500 })

  revalidateBlog(before.slug)
  return NextResponse.json({ post: data })
}
