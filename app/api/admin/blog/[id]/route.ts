export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { blogAdminDb, requireBlogAdmin, normalizeBlogWrite, revalidateBlog } from '@/lib/blog/admin-server'
import { uniqueSlug } from '@/lib/blog/posts'

type Ctx = { params: Promise<{ id: string }> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** GET — one post with its full body, for the editor. */
export async function GET(_req: Request, { params }: Ctx) {
  const denied = await requireBlogAdmin()
  if (denied) return denied
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 })

  const { data, error } = await blogAdminDb().from('blog_posts').select('*').eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'המאמר לא נמצא' }, { status: 404 })
  return NextResponse.json({ post: data })
}

/** PATCH — save edits. Keeps the slug unique; the old URL stops resolving. */
export async function PATCH(request: Request, { params }: Ctx) {
  const denied = await requireBlogAdmin()
  if (denied) return denied
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 })

  const parsed = normalizeBlogWrite(await request.json().catch(() => ({})))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const db = blogAdminDb()
  const { data: before } = await db.from('blog_posts').select('slug').eq('id', id).maybeSingle()
  if (!before) return NextResponse.json({ error: 'המאמר לא נמצא' }, { status: 404 })

  const { data: taken } = await db
    .from('blog_posts').select('slug').like('slug', `${parsed.value.slug}%`).neq('id', id)
  const slug = uniqueSlug(parsed.value.slug, (taken || []).map((r: any) => r.slug))

  const { data, error } = await db
    .from('blog_posts')
    .update({ ...parsed.value, slug })
    .eq('id', id)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message, code: (error as any).code }, { status: 500 })

  revalidateBlog(slug, before.slug !== slug ? before.slug : '')
  return NextResponse.json({ post: data })
}

/** DELETE — remove a post permanently. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const denied = await requireBlogAdmin()
  if (denied) return denied
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 })

  const db = blogAdminDb()
  const { data: before } = await db.from('blog_posts').select('slug').eq('id', id).maybeSingle()
  const { error } = await db.from('blog_posts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidateBlog(before?.slug || '')
  return NextResponse.json({ deleted: true })
}
