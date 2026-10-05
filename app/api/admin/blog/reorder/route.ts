export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { blogAdminDb, requireBlogAdmin, revalidateBlog } from '@/lib/blog/admin-server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST { ids: string[] }  — set a manual order: ids[0] gets sort_order 1, …
 * POST { reset: true }    — clear every manual position (back to date order)
 *
 * The admin sends the COMPLETE list in its new order, so positions are always
 * a clean 1..n with no gaps or duplicates, regardless of what was there before.
 */
export async function POST(request: Request) {
  const denied = await requireBlogAdmin()
  if (denied) return denied

  const body = await request.json().catch(() => ({}))
  const db = blogAdminDb()

  if (body?.reset === true) {
    const { error } = await db.from('blog_posts').update({ sort_order: null }).not('sort_order', 'is', null)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    revalidateBlog()
    return NextResponse.json({ reset: true })
  }

  const ids: unknown = body?.ids
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((x) => typeof x === 'string' && UUID.test(x))) {
    return NextResponse.json({ error: 'רשימת מזהים לא תקינה' }, { status: 400 })
  }
  if (new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: 'מזהה כפול ברשימה' }, { status: 400 })
  }

  // One update per row: a handful of posts, and it keeps every write explicit.
  const results = await Promise.all(
    (ids as string[]).map((id, i) => db.from('blog_posts').update({ sort_order: i + 1 }).eq('id', id)),
  )
  const failed = results.find((r) => r.error)
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 })

  revalidateBlog()
  return NextResponse.json({ reordered: ids.length })
}
