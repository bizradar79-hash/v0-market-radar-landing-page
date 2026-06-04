export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import type { SnapshotData } from '@/lib/scan/snapshot'

function getAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

async function getCallerUser() {
  const reqHeaders = await headers()
  const authHeader = reqHeaders.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => [], setAll: () => {} },
        global: { headers: { Authorization: `Bearer ${token}` } } },
    )
    const { data } = await supabase.auth.getUser(token)
    return { user: data?.user, supabase }
  }
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  return { user: data?.user, supabase }
}

// Replace all rows in `table` for a company with the snapshot's rows.
async function restoreTable(adminDb: any, table: string, companyId: string, rows: any[]) {
  await adminDb.from(table).delete().eq('company_id', companyId)
  if (Array.isArray(rows) && rows.length > 0) {
    // Strip volatile keys; keep stored shape otherwise.
    const clean = rows.map((r: any) => {
      const { ...rest } = r
      rest.company_id = companyId
      return rest
    })
    await adminDb.from(table).insert(clean)
  }
}

// POST /api/admin/restore-snapshot — admin-only.
// Body: { company_id: string, snapshot_id: string }
export async function POST(request: Request) {
  const { user, supabase } = await getCallerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: role } = await supabase
    .from('user_roles').select('is_admin').eq('user_id', user.id).single()
  if (!role?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const companyId: string | undefined = body.company_id
  const snapshotId: string | undefined = body.snapshot_id
  if (!companyId || !snapshotId) {
    return NextResponse.json({ error: 'Missing company_id or snapshot_id' }, { status: 400 })
  }

  const adminDb = getAdminClient()

  const { data: snap, error: snapErr } = await adminDb
    .from('scan_snapshots')
    .select('id, company_id, data')
    .eq('id', snapshotId)
    .eq('company_id', companyId)
    .single()

  if (snapErr || !snap) {
    return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 })
  }

  const data = (snap.data ?? {}) as SnapshotData
  const restored: Record<string, any> = {}

  try {
    // JSONB columns on companies
    const { error: compErr } = await adminDb.from('companies').update({
      seo_ranking: data.seo_ranking ?? null,
      geo_ranking: data.geo_ranking ?? null,
      industry_trends: data.industry_trends ?? null,
      keyword_trends: data.keyword_trends ?? null,
    }).eq('id', companyId)
    restored.companies = compErr ? `error: ${compErr.message}` : 'ok'

    // Row-based tables
    await restoreTable(adminDb, 'competitors', companyId, data.competitors ?? [])
    restored.competitors = (data.competitors ?? []).length
    await restoreTable(adminDb, 'news', companyId, data.news ?? [])
    restored.news = (data.news ?? []).length
    await restoreTable(adminDb, 'conferences', companyId, data.conferences ?? [])
    restored.conferences = (data.conferences ?? []).length
    await restoreTable(adminDb, 'tenders', companyId, data.tenders ?? [])
    restored.tenders = (data.tenders ?? []).length

    return NextResponse.json({ success: true, snapshot_id: snapshotId, restored })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message, restored }, { status: 500 })
  }
}
