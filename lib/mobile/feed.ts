// Mobile activity feed: merges the business's rows from several tables into one
// date-ordered stream of uniform cards. Every read goes through scopedDb(), so
// rows are always filtered by the authenticated company id.

import { scopedDb } from './core'

export type FeedType = 'news' | 'opportunity' | 'tender' | 'conference' | 'lead' | 'competitor_update'

export interface FeedItem {
  id: string            // '<type>:<row id>' — stable, used for read status
  type: FeedType
  title: string
  summary: string | null
  date: string          // ISO 8601
  source_url: string | null
  read_status: 'read' | 'unread'
  payload: Record<string, unknown>
}

type Source = {
  type: FeedType
  table: string
  dateCol: string
  cols: string
  map: (r: any) => Omit<FeedItem, 'id' | 'type' | 'read_status' | 'date'>
}

const str = (v: any) => (typeof v === 'string' && v.trim() ? v.trim() : null)

export const SOURCES: Source[] = [
  {
    type: 'news', table: 'news', dateCol: 'published_at',
    cols: 'id, title, source, url, category, sentiment, summary, published_at',
    map: r => ({
      title: r.title || '', summary: str(r.summary), source_url: str(r.url),
      payload: { source: str(r.source), category: str(r.category), sentiment: str(r.sentiment) },
    }),
  },
  {
    type: 'opportunity', table: 'opportunities', dateCol: 'created_at',
    cols: 'id, title, description, impact_score, confidence_score, priority, type, actions, sources, created_at',
    map: r => ({
      title: r.title || '', summary: str(r.description),
      source_url: Array.isArray(r.sources) ? str(r.sources.find((s: any) => typeof s === 'string' && /^https?:/.test(s))) : null,
      payload: {
        impact_score: r.impact_score ?? null, confidence_score: r.confidence_score ?? null,
        priority: r.priority ?? null, opportunity_type: r.type ?? null,
        actions: Array.isArray(r.actions) ? r.actions : [], sources: Array.isArray(r.sources) ? r.sources : [],
      },
    }),
  },
  {
    type: 'tender', table: 'tenders', dateCol: 'created_at',
    cols: 'id, title, organization, deadline, budget, description, link, relevance_score, created_at',
    map: r => ({
      title: r.title || '', summary: str(r.description), source_url: str(r.link),
      payload: { organization: str(r.organization), deadline: r.deadline ?? null, budget: r.budget ?? null, relevance_score: r.relevance_score ?? null },
    }),
  },
  {
    type: 'conference', table: 'conferences', dateCol: 'created_at',
    cols: 'id, name, date, location, description, url, category, created_at',
    map: r => ({
      title: r.name || '', summary: str(r.description), source_url: str(r.url),
      payload: { event_date: r.date ?? null, location: str(r.location), category: str(r.category) },
    }),
  },
  {
    type: 'lead', table: 'leads', dateCol: 'created_at',
    cols: 'id, name, website, industry, location, reason, score, source, created_at',
    map: r => ({
      title: r.name || '', summary: str(r.reason), source_url: str(r.website),
      payload: { industry: str(r.industry), location: str(r.location), score: r.score ?? null, source: str(r.source) },
    }),
  },
  {
    // Competitor tracking: social activity + Google reviews per competitor.
    type: 'competitor_update', table: 'competitor_tracking', dateCol: 'scanned_at',
    cols: 'id, competitor_name, resolved_links, insights, reviews, scanned_at',
    map: r => {
      const rv = r.reviews || null
      const links = r.resolved_links || {}
      return {
        title: r.competitor_name || '',
        summary: null,
        source_url: str(links.website) || str(links.instagram) || str(links.facebook) || str(links.mapsUrl),
        payload: {
          competitor_name: r.competitor_name,
          links: { website: str(links.website), instagram: str(links.instagram), facebook: str(links.facebook), linkedin: str(links.linkedin), maps: str(links.mapsUrl) },
          activity: r.insights || null,
          reviews: rv,
        },
      }
    },
  },
]

export const FEED_TYPES = SOURCES.map(s => s.type)

type Cursor = { d: string; k: string }

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString('base64url')
}
export function decodeCursor(s: string | null): Cursor | null {
  if (!s) return null
  try {
    const c = JSON.parse(Buffer.from(s, 'base64url').toString('utf8'))
    if (typeof c?.d === 'string' && !isNaN(Date.parse(c.d)) && typeof c?.k === 'string') return c
  } catch {}
  return null
}

/** Total order for the feed: newest first, then id desc as a tie-breaker. */
export function compareFeed(a: { date: string; id: string }, b: { date: string; id: string }): number {
  const d = Date.parse(b.date) - Date.parse(a.date)
  if (d !== 0) return d
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

/** True when `item` comes strictly after the cursor position in feed order. */
export function isAfterCursor(item: { date: string; id: string }, c: Cursor): boolean {
  return compareFeed({ date: c.d, id: c.k }, item) < 0
}

export async function loadFeed(companyId: string, opts: { limit: number; cursor: Cursor | null; types: FeedType[] }) {
  const db = scopedDb(companyId)
  const sources = SOURCES.filter(s => opts.types.includes(s.type))
  // Extra rows per source so items sharing the cursor's exact timestamp aren't lost.
  const perSource = opts.limit + 25

  const results = await Promise.all(sources.map(async s => {
    let q = db.from(s.table, s.cols).not(s.dateCol, 'is', null)
    // +1ms: DB timestamps have µs precision but the cursor has ms, so rows in
    // the cursor's millisecond must still be fetched (then filtered exactly below).
    if (opts.cursor) q = q.lte(s.dateCol, new Date(Date.parse(opts.cursor.d) + 1).toISOString())
    const { data, error } = await q.order(s.dateCol, { ascending: false }).limit(perSource)
    if (error) {
      // One missing/broken table must not kill the whole feed.
      console.error(`[mobile/feed] ${s.table}:`, error.message)
      return []
    }
    return (data || []).map((r: any) => ({
      id: `${s.type}:${r.id}`,
      type: s.type,
      date: new Date(r[s.dateCol]).toISOString(),
      ...s.map(r),
    }))
  }))

  let items = results.flat().sort(compareFeed)
  if (opts.cursor) items = items.filter(i => isAfterCursor(i, opts.cursor!))
  const page = items.slice(0, opts.limit)
  const hasMore = items.length > opts.limit

  // Read status for this page only (scoped by company).
  const readSet = new Set<string>()
  if (page.length) {
    const { data } = await db.from('mobile_feed_reads', 'item_key').in('item_key', page.map(i => i.id))
    for (const r of (data || []) as any[]) readSet.add(r.item_key)
  }

  const last = page[page.length - 1]
  return {
    items: page.map(i => ({ ...i, read_status: readSet.has(i.id) ? 'read' : 'unread' })) as FeedItem[],
    next_cursor: hasMore && last ? encodeCursor({ d: last.date, k: last.id }) : null,
  }
}
