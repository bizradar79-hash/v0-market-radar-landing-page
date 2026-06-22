import type { MetadataRoute } from 'next'

const HOST = 'https://www.nsradar.co.il'

// Served at /sitemap.xml. Public marketing pages only — gated/auth pages are
// intentionally excluded (and disallowed in robots.ts).
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return [
    { url: `${HOST}/`,              lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${HOST}/contact`,       lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${HOST}/privacy`,       lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
    { url: `${HOST}/terms`,         lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
    { url: `${HOST}/accessibility`, lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
  ]
}
