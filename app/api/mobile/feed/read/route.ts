export const dynamic = 'force-dynamic'

import { apiError, json, requireMobileAuth, serviceDb } from '@/lib/mobile/core'
import { FEED_TYPES } from '@/lib/mobile/feed'

const ID = new RegExp(`^(${FEED_TYPES.join('|')}):[0-9a-zA-Z-]{1,64}$`)

/** POST /api/mobile/feed/read — { ids: string[], read?: boolean } marks feed items read/unread. */
export async function POST(req: Request) {
  const r = await requireMobileAuth(req)
  if ('res' in r) return r.res

  const body = await req.json().catch(() => null)
  const ids: unknown = body?.ids
  const read = body?.read !== false
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100 || !ids.every(i => typeof i === 'string' && ID.test(i))) {
    return apiError(400, 'invalid_request', 'ids must be 1–100 feed item ids.')
  }

  // Rows are keyed by the token's company id, so a caller can only ever
  // change its OWN read state.
  const db = serviceDb()
  const companyId = r.auth.companyId
  const { error } = read
    ? await db.from('mobile_feed_reads').upsert(ids.map(k => ({ company_id: companyId, item_key: k })), { onConflict: 'company_id,item_key' })
    : await db.from('mobile_feed_reads').delete().eq('company_id', companyId).in('item_key', ids as string[])
  if (error) return apiError(500, 'server_error', 'Could not update read status.')

  return json({ updated: ids.length, read_status: read ? 'read' : 'unread' })
}
