/**
 * SHARED competitor-display logic — used by BOTH the admin/client module page
 * and the weekly report, so the two can never drift apart.
 *
 * Everything here is a pure projection of what a tracking run already stored
 * (competitor_tracking.sources / .insights / .reviews / .resolved_links).
 * No fetching, no AI.
 */

export type PlatformKey = 'website' | 'instagram' | 'facebook' | 'linkedin' | 'tiktok'

export const PLATFORM_LABELS: Record<string, string> = {
  website: 'אתר', instagram: 'אינסטגרם', facebook: 'פייסבוק', linkedin: 'לינקדאין', tiktok: 'טיקטוק',
}

/** Per-platform accent, so the label reads as a badge rather than grey text. */
export const PLATFORM_STYLE: Record<string, { bg: string; fg: string }> = {
  instagram: { bg: '#fce7f3', fg: '#be185d' },
  facebook: { bg: '#dbeafe', fg: '#1d4ed8' },
  linkedin: { bg: '#e0f2fe', fg: '#0369a1' },
  website: { bg: '#e7f5f2', fg: '#0f766e' },
  tiktok: { bg: '#f1f5f9', fg: '#334155' },
}
export const platformStyle = (p: string) => PLATFORM_STYLE[p] || PLATFORM_STYLE.tiktok
export const platformLabel = (p: string) => PLATFORM_LABELS[p] || p

/** The posts list window — deliberately tighter than the 45-day insights. */
export const POSTS_WINDOW_DAYS = Number(process.env.NEXT_PUBLIC_COMPETITOR_POSTS_DAYS) || 14
export const MAX_POSTS_SHOWN = 6

export interface DisplayPost {
  platform: string
  platformLabel: string
  dateLabel: string
  caption: string
  /** Exact counts, kept SEPARATE — a combined "engagement" number hid which was which. */
  likes: number | null
  comments: number | null
  views: number | null
  url: string
  /** Sort key (ms). */
  ts: number
}

const heDate = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })
}
const numOrNull = (v: any): number | null => (typeof v === 'number' && isFinite(v) ? v : null)

function toDisplayPost(p: any, platform: string): DisplayPost {
  const t = p?.date ? new Date(p.date).getTime() : NaN
  return {
    platform,
    platformLabel: platformLabel(platform),
    dateLabel: heDate(p?.date),
    caption: String(p?.caption || '').trim().slice(0, 140) || '(ללא כיתוב)',
    likes: numOrNull(p?.likes),
    comments: numOrNull(p?.comments),
    views: numOrNull(p?.views),
    url: String(p?.postUrl || '').trim(),
    ts: isNaN(t) ? 0 : t,
  }
}

/**
 * Recent posts across every source, newest first.
 *
 * NO DEDUPING ON PURPOSE: a competitor cross-posting the same content to
 * Instagram and Facebook is genuinely two posts with two audiences and two
 * engagement numbers. What made it look like a duplicate was an unclear
 * platform label — so each post is tagged prominently instead of merged.
 */
export function recentPostsFrom(
  sources: any[] | null | undefined,
  opts?: { days?: number; max?: number; now?: number },
): DisplayPost[] {
  const days = opts?.days ?? POSTS_WINDOW_DAYS
  const max = opts?.max ?? MAX_POSTS_SHOWN
  const cutoff = (opts?.now ?? Date.now()) - days * 86400000
  const out: DisplayPost[] = []
  for (const src of sources || []) {
    for (const p of (Array.isArray(src?.posts) ? src.posts : [])) {
      const dp = toDisplayPost(p, src.source)
      // Undated posts are excluded rather than assumed recent.
      if (!dp.ts || dp.ts < cutoff) continue
      out.push(dp)
    }
  }
  return out.sort((a, b) => b.ts - a.ts).slice(0, max)
}

/**
 * The notable/top-engagement posts, resolved back to the FULL post record so
 * they carry the same likes/comments/link as the recent list. The stored
 * insight only kept a combined "N תגובות+לייקים" string.
 */
export function notablePostsFrom(
  sources: any[] | null | undefined,
  insights: any,
  max = 2,
): DisplayPost[] {
  const tops: any[] = Array.isArray(insights?.topPosts) ? insights.topPosts : []
  if (!tops.length) return []
  const all: DisplayPost[] = []
  for (const src of sources || []) {
    for (const p of (Array.isArray(src?.posts) ? src.posts : [])) all.push(toDisplayPost(p, src.source))
  }
  const picked: DisplayPost[] = []
  for (const t of tops.slice(0, max)) {
    const capKey = String(t?.caption || '').slice(0, 60)
    const hit = all.find((p) => p.platform === t?.source && p.caption.startsWith(capKey.slice(0, 40)))
      || all.find((p) => p.caption.startsWith(capKey.slice(0, 40)))
    if (hit && !picked.some((x) => x.url === hit.url && x.caption === hit.caption)) picked.push(hit)
  }
  return picked
}

/** "👍 312 · 💬 18 · 1,204 צפיות" — explicit counts, never a merged total. */
export function engagementLabel(p: DisplayPost): string {
  const parts: string[] = []
  if (p.likes != null) parts.push(`👍 ${p.likes.toLocaleString('he-IL')}`)
  if (p.comments != null) parts.push(`💬 ${p.comments.toLocaleString('he-IL')}`)
  if (p.views != null) parts.push(`${p.views.toLocaleString('he-IL')} צפיות`)
  return parts.join(' · ')
}

/**
 * The competitor's Google listing, built from the cid we resolved during
 * tracking — so the reviews block can be clicked through to the real reviews.
 */
export function googleListingUrl(
  resolvedLinks: any, reviews?: any,
): string {
  const cid = resolvedLinks?.cid || reviews?.cid
  if (cid) return `https://www.google.com/maps?cid=${cid}`
  const placeId = resolvedLinks?.placeId || reviews?.placeId
  if (placeId) return `https://www.google.com/maps/place/?q=place_id:${placeId}`
  return String(resolvedLinks?.mapsUrl || reviews?.mapsUrl || '')
}
