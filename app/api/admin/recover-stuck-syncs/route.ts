export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function getAdminSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

async function verifyAccess(request: Request): Promise<boolean> {
  // Allow cron secret
  const auth = request.headers.get('authorization')
  if (auth === `Bearer ${process.env.CRON_SECRET}` && process.env.CRON_SECRET) {
    return true
  }
  const cronHeader = request.headers.get('x-cron-secret')
  if (cronHeader === process.env.CRON_SECRET && process.env.CRON_SECRET) {
    return true
  }
  // Allow logged-in admin
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      },
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false
    const adminDb = getAdminSupabase()
    const { data: role } = await adminDb
      .from('user_roles').select('is_admin').eq('user_id', user.id).single()
    return role?.is_admin === true
  } catch {
    return false
  }
}

export async function POST(request: Request) {
  const hasAccess = await verifyAccess(request)
  if (!hasAccess) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminDb = getAdminSupabase()

  // Find anyone stuck in 'running' for more than 15 minutes
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()

  const { data: stuck, error: findErr } = await adminDb
    .from('companies')
    .select('id, last_sync_at, name')
    .eq('sync_status', 'running')
    .or(`last_sync_at.is.null,last_sync_at.lt.${fifteenMinAgo}`)

  if (findErr) {
    return NextResponse.json({ error: findErr.message }, { status: 500 })
  }

  const ids = (stuck || []).map(s => s.id)

  if (ids.length > 0) {
    const { error: updateErr } = await adminDb
      .from('companies')
      .update({
        sync_status: 'error',
        sync_log: [{ module: 'recovery', status: 'error', message: 'Sync timed out or crashed. Reset by auto-recovery.', updated_at: new Date().toISOString() }],
      } as any)
      .in('id', ids)

    if (updateErr) {
      console.error('[recover-stuck] Update failed:', updateErr.message)
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }
  }

  const names = (stuck || []).map(s => s.name).filter(Boolean)
  console.log(`[recover-stuck] Recovered ${ids.length} stuck syncs:`, names.join(', ') || 'none')

  return NextResponse.json({ recovered: ids.length, ids, names })
}
