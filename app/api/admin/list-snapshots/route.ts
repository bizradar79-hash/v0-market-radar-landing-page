export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

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

// GET /api/admin/list-snapshots?company_id=... — admin-only.
export async function GET(request: Request) {
  const { user, supabase } = await getCallerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: role } = await supabase
    .from('user_roles').select('is_admin').eq('user_id', user.id).single()
  if (!role?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const companyId = new URL(request.url).searchParams.get('company_id')
  if (!companyId) return NextResponse.json({ error: 'Missing company_id' }, { status: 400 })

  const adminDb = getAdminClient()
  const { data, error } = await adminDb
    .from('scan_snapshots')
    .select('id, trigger, created_at, counts')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, snapshots: data ?? [] })
}
