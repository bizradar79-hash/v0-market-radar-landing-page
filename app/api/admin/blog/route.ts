export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { blogAdminDb, requireBlogAdmin, normalizeBlogWrite, revalidateBlog } from '@/lib/blog/admin-server'
import { BLOG_LIST_COLUMNS, compareBlogOrder, uniqueSlug } from '@/lib/blog/posts'

/** GET — every post, drafts included, in the same order the public blog uses. */
export async function GET() {
  const denied = await requireBlogAdmin()
  if (denied) return denied

  const { data, error } = await blogAdminDb()
    .from('blog_posts')
    .select(BLOG_LIST_COLUMNS)
  if (error) {
    const missing = (error as any).code === '42P01'
    return NextResponse.json(
      { error: missing ? 'טבלת blog_posts לא קיימת — יש להריץ את supabase/add_blog.sql' : error.message, code: (error as any).code },
      { status: 500 },
    )
  }
  const posts = ((data || []) as any[]).sort(compareBlogOrder)
  return NextResponse.json({ posts })
}

/** POST — create a post. The slug is made unique automatically. */
export async function POST(request: Request) {
  const denied = await requireBlogAdmin()
  if (denied) return denied

  const body = await request.json().catch(() => ({}))
  const parsed = normalizeBlogWrite(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const db = blogAdminDb()
  const { data: taken } = await db.from('blog_posts').select('slug').like('slug', `${parsed.value.slug}%`)
  const slug = uniqueSlug(parsed.value.slug, (taken || []).map((r: any) => r.slug))

  const { data, error } = await db
    .from('blog_posts')
    .insert({ ...parsed.value, slug })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message, code: (error as any).code }, { status: 500 })

  revalidateBlog(slug)
  return NextResponse.json({ post: data })
}
