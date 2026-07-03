export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { hiddenKey, type HiddenItemType, HIDDEN_ITEM_TYPES } from '@/lib/admin/hidden'
import { norm } from '@/lib/match/hebrew-core'

function adminDb() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

async function requireAdmin(): Promise<{ denied: NextResponse | null; userId: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { denied: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), userId: null }
  const { data: role } = await supabase
    .from('user_roles').select('is_admin').eq('user_id', user.id).single()
  if (!role?.is_admin) return { denied: NextResponse.json({ error: 'Forbidden' }, { status: 403 }), userId: null }
  return { denied: null, userId: user.id }
}

// Table-backed types → { table, field } for immediate live removal at hide time.
const TABLE_MAP: Record<string, { table: string; field: string }> = {
  tender: { table: 'tenders', field: 'title' },
  conference: { table: 'conferences', field: 'name' },
  lead: { table: 'leads', field: 'name' },
  news: { table: 'news', field: 'title' },
  competitor: { table: 'competitors', field: 'name' },
}

function isValidType(t: any): t is HiddenItemType {
  return HIDDEN_ITEM_TYPES.includes(t)
}

// GET /api/admin/hidden-items?company_id=... → { hidden: [{id,item_type,item_key,label,reason,hidden_at}] }
export async function GET(request: Request) {
  const { denied } = await requireAdmin()
  if (denied) return denied

  const companyId = new URL(request.url).searchParams.get('company_id')
  if (!companyId) return NextResponse.json({ error: 'Missing company_id' }, { status: 400 })

  const db = adminDb()
  const { data, error } = await db
    .from('admin_hidden_items')
    .select('id, item_type, item_key, label, reason, hidden_at')
    .eq('company_id', companyId)
    .order('hidden_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, hidden: data || [] })
}

// POST /api/admin/hidden-items  { company_id, item_type, label, reason? }
// Records the hide AND removes the item from the live table/blob immediately so
// the client's direct read is instantly clean. Backup stored in `data` for restore.
export async function POST(request: Request) {
  const { denied, userId } = await requireAdmin()
  if (denied) return denied

  const body = await request.json().catch(() => ({}))
  const companyId = body.company_id
  const itemType = body.item_type
  const label = (body.label || '').toString().trim()
  const reason = body.reason ? body.reason.toString().slice(0, 500) : null
  if (!companyId || !isValidType(itemType) || !label) {
    return NextResponse.json({ error: 'Missing company_id, item_type or label' }, { status: 400 })
  }

  const db = adminDb()
  const key = hiddenKey(label)
  let backup: any = null

  // Immediate live removal (best-effort).
  try {
    if (TABLE_MAP[itemType]) {
      const { table, field } = TABLE_MAP[itemType]
      const { data: rows } = await db.from(table).select('*').eq('company_id', companyId)
      const matched = (rows || []).filter((r: any) => norm(r[field] || '') === key)
      if (matched.length) {
        backup = matched
        await db.from(table).delete().in('id', matched.map((r: any) => r.id))
      }
    } else if (itemType === 'channel') {
      const { data: co } = await db.from('companies').select('distribution_channels, business_profile').eq('id', companyId).single()
      const arr: string[] = Array.isArray(co?.distribution_channels) ? co!.distribution_channels : []
      const removed = arr.filter((c) => norm(c) === key)
      const kept = arr.filter((c) => norm(c) !== key)
      const bp: any = co?.business_profile && typeof co.business_profile === 'object' ? { ...co.business_profile } : {}
      if (Array.isArray(bp.distributionChannels)) bp.distributionChannels = bp.distributionChannels.filter((c: string) => norm(c) !== key)
      backup = removed
      await db.from('companies').update({ distribution_channels: kept, business_profile: bp }).eq('id', companyId)
    } else if (itemType === 'trend') {
      const { data: co } = await db.from('companies').select('keyword_trends').eq('id', companyId).single()
      const map: Record<string, any> = co?.keyword_trends && typeof co.keyword_trends === 'object' ? { ...co.keyword_trends } : {}
      const removed: Record<string, any> = {}
      for (const k of Object.keys(map)) {
        const kwLabel = map[k]?.keyword || k
        if (norm(kwLabel) === key) { removed[k] = map[k]; delete map[k] }
      }
      backup = removed
      await db.from('companies').update({ keyword_trends: map }).eq('id', companyId)
    }
  } catch (e: any) {
    console.warn('[hidden-items] live removal failed:', e?.message)
  }

  // Record the hide (idempotent on the unique index).
  const { error } = await db
    .from('admin_hidden_items')
    .upsert(
      { company_id: companyId, item_type: itemType, item_key: key, label, reason, hidden_by: userId, data: backup },
      { onConflict: 'company_id,item_type,item_key' },
    )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

// DELETE /api/admin/hidden-items  { id }  → restore (remove hide + re-add backup)
export async function DELETE(request: Request) {
  const { denied } = await requireAdmin()
  if (denied) return denied

  const body = await request.json().catch(() => ({}))
  const id = body.id
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const db = adminDb()
  const { data: row } = await db
    .from('admin_hidden_items')
    .select('id, company_id, item_type, data')
    .eq('id', id)
    .single()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Re-add the backup so the item reappears immediately (best-effort; the next
  // scan would also re-add it now that the hide is gone).
  try {
    const backup = (row as any).data
    const itemType = (row as any).item_type as string
    const companyId = (row as any).company_id
    if (TABLE_MAP[itemType] && Array.isArray(backup) && backup.length) {
      const { table } = TABLE_MAP[itemType]
      const rows = backup.map((r: any) => { const { id: _id, created_at: _c, ...rest } = r; return { ...rest, company_id: companyId } })
      await db.from(table).insert(rows)
    } else if (itemType === 'channel' && Array.isArray(backup) && backup.length) {
      const { data: co } = await db.from('companies').select('distribution_channels, business_profile').eq('id', companyId).single()
      const arr: string[] = Array.isArray(co?.distribution_channels) ? co!.distribution_channels : []
      const merged = Array.from(new Set([...arr, ...backup]))
      const bp: any = co?.business_profile && typeof co.business_profile === 'object' ? { ...co.business_profile } : {}
      const bpArr: string[] = Array.isArray(bp.distributionChannels) ? bp.distributionChannels : []
      bp.distributionChannels = Array.from(new Set([...bpArr, ...backup]))
      await db.from('companies').update({ distribution_channels: merged, business_profile: bp }).eq('id', companyId)
    } else if (itemType === 'trend' && backup && typeof backup === 'object') {
      const { data: co } = await db.from('companies').select('keyword_trends').eq('id', companyId).single()
      const map: Record<string, any> = co?.keyword_trends && typeof co.keyword_trends === 'object' ? { ...co.keyword_trends } : {}
      await db.from('companies').update({ keyword_trends: { ...map, ...backup } }).eq('id', companyId)
    }
  } catch (e: any) {
    console.warn('[hidden-items] restore re-add failed:', e?.message)
  }

  const { error } = await db.from('admin_hidden_items').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
