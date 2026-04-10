export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'

const STALE_RUNNING_MS = 15 * 60 * 1000 // 15 minutes — auto-reset stuck syncs

function getAdminSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ skip: true })

  const { data } = await supabase
    .from('companies')
    .select('next_sync_at, sync_status, last_sync_at')
    .eq('id', user.id)
    .single()

  if (!data?.next_sync_at) return NextResponse.json({ skip: true })

  // ── Auto-reset stale 'running' status ──────────────────────────────────────
  if (data.sync_status === 'running') {
    const lastSync = data.last_sync_at ? new Date(data.last_sync_at).getTime() : 0
    const stale = Date.now() - lastSync > STALE_RUNNING_MS

    if (stale) {
      console.warn(`[sync/check] stale running for user ${user.id}, last_sync_at=${data.last_sync_at} — resetting to idle`)
      const adminDb = getAdminSupabase()
      await adminDb
        .from('companies')
        .update({ sync_status: 'idle', last_sync_at: new Date().toISOString() })
        .eq('id', user.id)
      // Fall through to check if sync is due
    } else {
      return NextResponse.json({ skip: true, reason: 'already_running' })
    }
  }

  if (new Date(data.next_sync_at) > new Date()) {
    return NextResponse.json({ skip: true, reason: 'not_due' })
  }

  // Trigger sync fire-and-forget
  const origin = new URL(request.url).origin
  fetch(`${origin}/api/sync/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ company_id: user.id, force: false }),
  }).catch(() => {})

  return NextResponse.json({ triggered: true })
}
