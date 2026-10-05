import type { MetadataRoute } from 'next'
import { listPublishedPosts } from '@/lib/blog/queries'

const HOST = 'https://www.nsradar.co.il'

// Re-generated periodically; admin blog writes also revalidate it on demand.
export const revalidate = 3600

// Served at /sitemap.xml. Public marketing pages + published blog posts only —
// gated/auth pages are intentionally excluded (and disallowed in robots.ts).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${HOST}/`,              lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${HOST}/blog`,          lastModified: now, changeFrequency: 'weekly',  priority: 0.8 },
    { url: `${HOST}/contact`,       lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${HOST}/privacy`,       lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
    { url: `${HOST}/terms`,         lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
    { url: `${HOST}/accessibility`, lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
  ]

  // Never throws: if the blog can't be read, the static pages still ship.
  const posts = await listPublishedPosts()
  const postPages: MetadataRoute.Sitemap = posts.map((p) => ({
    url: `${HOST}/blog/${encodeURIComponent(p.slug)}`,
    lastModified: new Date(p.updated_at || p.published_at || now),
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  return [...staticPages, ...postPages]
}
