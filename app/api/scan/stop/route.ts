export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@/lib/supabase/server'
import { stopScan } from '@/lib/scan/breaker'

function getAdminSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

// POST { company_id } — sets scan_control.status='stopped'. Auth: admin-secret
// header, the company owner, or a logged-in admin.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const companyId: string | undefined = body.company_id

  const adminSecret = request.headers.get('x-admin-secret')
  let authorized = !!adminSecret && adminSecret === process.env.SUPABASE_SERVICE_ROLE_KEY

  let targetId = companyId

  if (!authorized) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // Owner stopping their own scan
    if (!targetId || targetId === user.id) {
      authorized = true
      targetId = user.id
    } else {
      const { data: role } = await supabase.from('user_roles').select('is_admin').eq('user_id', user.id).single()
      authorized = !!role?.is_admin
    }
  }

  if (!authorized) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!targetId) return NextResponse.json({ error: 'Missing company_id' }, { status: 400 })

  const adminDb = getAdminSupabase()
  const control = await stopScan(adminDb, targetId)

  // Also reflect in the legacy sync_status field so older UI shows it.
  try { await adminDb.from('companies').update({ sync_status: 'stopped' } as any).eq('id', targetId) } catch {}

  return NextResponse.json({ success: true, scan_control: control })
}
