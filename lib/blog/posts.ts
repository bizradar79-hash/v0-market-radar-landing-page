// Blog post shape, slugs and ordering — shared by the admin API, the public
// pages and the sitemap. No framework or database imports, so it's testable.

export interface BlogPost {
  id: string
  title: string
  slug: string
  content: string
  excerpt: string | null
  cover_image_url: string | null
  meta_description: string | null
  published: boolean
  published_at: string | null
  sort_order: number | null
  created_at: string
  updated_at: string
}

/** Columns for list views — everything except the (possibly large) body. */
export const BLOG_LIST_COLUMNS =
  'id, title, slug, excerpt, cover_image_url, meta_description, published, published_at, sort_order, created_at, updated_at'

// ── Slugs ──────────────────────────────────────────────────────────────────
// Hebrew slugs are legitimate (browsers display them, Google indexes them), and
// transliterating Hebrew loses meaning. So: keep Hebrew and Latin letters and
// digits, turn everything else into single dashes.
export function slugify(input: string): string {
  return String(input || '')
    .normalize('NFKC')
    .toLowerCase()
    // Hebrew niqqud and cantillation marks — they'd make visually identical
    // titles produce different slugs.
    .replace(/[֑-ׇ]/g, '')
    .replace(/[^\p{Script=Hebrew}a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')
}

/** True when a slug is something we would have produced ourselves. */
export function isValidSlug(slug: string): boolean {
  return !!slug && slug.length <= 80 && slugify(slug) === slug
}

/**
 * Make `base` unique against `taken` by appending -2, -3, … . `taken` should
 * exclude the post's own current slug when editing.
 */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const set = new Set(taken)
  const root = base || 'post'
  if (!set.has(root)) return root
  for (let i = 2; i < 10000; i++) {
    const candidate = `${root}-${i}`
    if (!set.has(candidate)) return candidate
  }
  return `${root}-${Date.now()}`
}

// ── Ordering ───────────────────────────────────────────────────────────────
// The rule, everywhere: a manual position (sort_order) wins; posts without one
// follow, newest first. It mirrors the SQL `order by sort_order asc nulls last,
// published_at desc` so in-memory and database ordering can never disagree.
export function compareBlogOrder(
  a: Pick<BlogPost, 'sort_order' | 'published_at' | 'created_at'>,
  b: Pick<BlogPost, 'sort_order' | 'published_at' | 'created_at'>,
): number {
  const ao = a.sort_order, bo = b.sort_order
  if (ao != null && bo != null && ao !== bo) return ao - bo
  if (ao != null && bo == null) return -1
  if (ao == null && bo != null) return 1
  const at = Date.parse(a.published_at || a.created_at) || 0
  const bt = Date.parse(b.published_at || b.created_at) || 0
  return bt - at
}

/** Is a post visible to the public right now? */
export function isPubliclyVisible(p: Pick<BlogPost, 'published' | 'published_at'>, now = Date.now()): boolean {
  if (!p.published) return false
  if (!p.published_at) return true
  const t = Date.parse(p.published_at)
  return Number.isNaN(t) ? true : t <= now
}

/** The meta description: explicit field, else the excerpt, capped for SERPs. */
export function metaDescriptionFor(p: Pick<BlogPost, 'meta_description' | 'excerpt'>, fallbackText = ''): string {
  const raw = (p.meta_description || p.excerpt || fallbackText || '').replace(/\s+/g, ' ').trim()
  return raw.length > 160 ? `${raw.slice(0, 157).replace(/\s+\S*$/, '')}…` : raw
}

export function formatHebrewDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
}
