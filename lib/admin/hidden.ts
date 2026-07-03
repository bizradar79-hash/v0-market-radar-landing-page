// ─────────────────────────────────────────────────────────────────────────
// Admin soft-hide list — shared enforcement helpers.
//
// An admin (in impersonate mode) can hide specific items from a client's view.
// Hidden items must (a) be invisible to the client everywhere they read data
// (live app pages, the web report, and report snapshots), and (b) NOT come back
// on future scans.
//
// The stable identity of an item is the NORMALIZED (lib/match/hebrew-core norm)
// title/name/keyword — the same normalization the scan dedup uses — because
// scans delete+reinsert these tables every run, so row ids are not stable but
// the normalized title is. This mirrors the client channel-deletion exclusion
// pattern, generalized to every item type and to admin level.
//
// All reads here go through a SERVICE-ROLE client so admin_hidden_items can stay
// service-role-only (RLS on, no client access → the client can never learn a
// hide exists), regardless of which db client the caller happens to hold.
// ─────────────────────────────────────────────────────────────────────────

import { createServerClient } from '@supabase/ssr'
import { norm } from '@/lib/match/hebrew-core'

export type HiddenItemType =
  | 'tender' | 'conference' | 'lead' | 'news' | 'competitor' | 'channel' | 'trend'

export const HIDDEN_ITEM_TYPES: HiddenItemType[] = [
  'tender', 'conference', 'lead', 'news', 'competitor', 'channel', 'trend',
]

// Normalize a raw label into the stable item_key. ONE normalization for keys,
// reused everywhere (hide, filter, scan-respect) so matching is consistent.
export function hiddenKey(raw: string | null | undefined): string {
  return norm(raw || '')
}

const SEP = '␟'
const setKey = (t: HiddenItemType, rawKey: string) => `${t}${SEP}${hiddenKey(rawKey)}`

export function serviceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

/**
 * Load the set of hidden keys for a company (optionally one type). The set holds
 * `${item_type}␟${normalized_key}` entries. Best-effort — never throws (a hide
 * table that doesn't exist yet, or any error, yields an empty set so nothing is
 * accidentally filtered / no read path breaks).
 */
export async function loadHiddenKeys(
  companyId: string,
  itemType?: HiddenItemType,
  db?: any,
): Promise<Set<string>> {
  try {
    const client = db ?? serviceClient()
    let q = client.from('admin_hidden_items').select('item_type, item_key').eq('company_id', companyId)
    if (itemType) q = q.eq('item_type', itemType)
    const { data } = await q
    return new Set((data || []).map((r: any) => `${r.item_type}${SEP}${r.item_key}`))
  } catch {
    return new Set()
  }
}

export function isHidden(set: Set<string>, itemType: HiddenItemType, rawKey: string): boolean {
  if (!set.size) return false
  return set.has(setKey(itemType, rawKey))
}

/** Filter an array in-memory, dropping items whose key is hidden. */
export function filterHidden<T>(
  items: T[] | null | undefined,
  itemType: HiddenItemType,
  set: Set<string>,
  keyFn: (t: T) => string,
): T[] {
  if (!items?.length || !set.size) return items || []
  return items.filter((it) => !isHidden(set, itemType, keyFn(it)))
}

/**
 * Convenience for scan write-paths: load the hide-list for one type and filter
 * the rows about to be inserted so a hidden item is never re-added. Best-effort.
 */
export async function filterInsertRows<T>(
  companyId: string,
  itemType: HiddenItemType,
  rows: T[] | null | undefined,
  keyFn: (t: T) => string,
): Promise<T[]> {
  if (!rows?.length) return rows || []
  const set = await loadHiddenKeys(companyId, itemType)
  return filterHidden(rows, itemType, set, keyFn)
}
