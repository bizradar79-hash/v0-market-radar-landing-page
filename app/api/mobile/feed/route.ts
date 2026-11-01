export const dynamic = 'force-dynamic'

import { apiError, json, requireMobileAuth } from '@/lib/mobile/core'
import { FEED_TYPES, decodeCursor, loadFeed, type FeedType } from '@/lib/mobile/feed'

/** GET /api/mobile/feed?limit=20&cursor=…&types=news,opportunity */
export async function GET(req: Request) {
  const r = await requireMobileAuth(req)
  if ('res' in r) return r.res

  const url = new URL(req.url)
  const limitRaw = Number(url.searchParams.get('limit') ?? 20)
  if (!Number.isInteger(limitRaw) || limitRaw < 1 || limitRaw > 50) {
    return apiError(400, 'invalid_request', 'limit must be an integer between 1 and 50.')
  }

  const cursorParam = url.searchParams.get('cursor')
  const cursor = decodeCursor(cursorParam)
  if (cursorParam && !cursor) return apiError(400, 'invalid_cursor', 'cursor is invalid.')

  const typesParam = url.searchParams.get('types')
  let types: FeedType[] = FEED_TYPES
  if (typesParam) {
    const asked = typesParam.split(',').map(t => t.trim()).filter(Boolean)
    const unknown = asked.filter(t => !FEED_TYPES.includes(t as FeedType))
    if (unknown.length) return apiError(400, 'invalid_request', `Unknown types: ${unknown.join(', ')}`)
    types = asked as FeedType[]
  }

  try {
    // Company id comes from the verified token only — never from the request.
    const feed = await loadFeed(r.auth.companyId, { limit: limitRaw, cursor, types })
    return json(feed)
  } catch (e: any) {
    console.error('[mobile/feed]', e?.message)
    return apiError(500, 'server_error', 'Could not load the feed.')
  }
}
