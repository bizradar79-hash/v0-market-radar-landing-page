export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { createReportSnapshot } from '@/lib/report/snapshot'

function getAdminSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

async function requireAdmin(): Promise<NextResponse | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: role } = await supabase
    .from('user_roles').select('is_admin').eq('user_id', user.id).single()
  if (!role?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}

// GET /api/admin/report-snapshots?company_id=... → { snapshots: [...] }
export async function GET(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied

  const companyId = new URL(request.url).searchParams.get('company_id')
  if (!companyId) return NextResponse.json({ error: 'Missing company_id' }, { status: 400 })

  const adminDb = getAdminSupabase()
  const { data, error } = await adminDb
    .from('report_snapshots')
    .select('id, snapshot_token, label, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Also return the company's permanent report token for convenience.
  const { data: co } = await adminDb.from('companies').select('report_token').eq('id', companyId).single()

  return NextResponse.json({ success: true, snapshots: data || [], report_token: co?.report_token ?? null })
}

// POST /api/admin/report-snapshots  { company_id }
// On-demand "צור דוח עדכני": assembles CURRENT stored data and saves a new
// snapshot immediately. NO scan, NO AI — pure read-only assembly of what's
// stored right now (useful after a single-module sync or manual edits).
export async function POST(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied

  const body = await request.json().catch(() => ({}))
  const companyId = body.company_id
  if (!companyId) return NextResponse.json({ error: 'Missing company_id' }, { status: 400 })

  // Optional: regenerate the weekly actions first (ONE model call) so they reflect
  // current data (fresh leads) and exclude admin-hidden items, before we freeze the
  // snapshot. Default path stays model-call-free (pure assemble of stored data).
  let actionsRegenerated = false
  if (body.regenerate_actions === true) {
    try {
      const origin = new URL(request.url).origin
      const res = await fetch(`${origin}/api/generate-weekly-actions?force=true`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-user-id': companyId,
          'x-admin-secret': process.env.SUPABASE_SERVICE_ROLE_KEY!,
        },
        body: JSON.stringify({ force: true }),
      })
      actionsRegenerated = res.ok
    } catch (e: any) {
      console.warn('[report-snapshots] actions regen failed:', e?.message)
    }
  }

  const adminDb = getAdminSupabase()
  const token = await createReportSnapshot(adminDb, companyId)
  if (!token) return NextResponse.json({ error: 'snapshot_failed' }, { status: 500 })

  return NextResponse.json({ success: true, snapshot_token: token, actionsRegenerated })
}
