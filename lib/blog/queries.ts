// Public-side blog reads (the /blog pages and the sitemap).
//
// Deliberately uses the ANON key, not the service role: the table's RLS policy
// only exposes published, already-dated posts, so even a bug in a query here
// cannot leak a draft. Never throws — a database problem renders an empty blog
// rather than a 500 on a public page.

import { createServerClient } from '@supabase/ssr'
import { BLOG_LIST_COLUMNS, compareBlogOrder, isPubliclyVisible, type BlogPost } from './posts'

function publicDb() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

export type BlogListItem = Omit<BlogPost, 'content'>

export async function listPublishedPosts(): Promise<BlogListItem[]> {
  try {
    const { data, error } = await publicDb()
      .from('blog_posts')
      .select(BLOG_LIST_COLUMNS)
      .eq('published', true)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('published_at', { ascending: false })
    if (error) {
      console.error('[blog] list failed:', error.message)
      return []
    }
    // Belt and braces: the same visibility + order rules in code.
    return ((data || []) as unknown as BlogListItem[])
      .filter((p) => isPubliclyVisible(p))
      .sort(compareBlogOrder)
  } catch (e: any) {
    console.error('[blog] list threw:', e?.message)
    return []
  }
}

export async function getPublishedPost(slug: string): Promise<BlogPost | null> {
  try {
    const { data, error } = await publicDb()
      .from('blog_posts')
      .select('*')
      .eq('slug', slug)
      .eq('published', true)
      .maybeSingle()
    if (error) {
      console.error('[blog] get failed:', error.message)
      return null
    }
    const post = data as BlogPost | null
    return post && isPubliclyVisible(post) ? post : null
  } catch (e: any) {
    console.error('[blog] get threw:', e?.message)
    return null
  }
}
