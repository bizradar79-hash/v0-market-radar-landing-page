export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { COMPETITOR_AUTODISCOVERY_ENABLED } from '@/lib/flags'
import { captureSnapshot } from '@/lib/scan/snapshot'

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

// POST /api/admin/refresh-user — trigger full re-scan for one or more users
// Body: { userId: string } | { userIds: string[] }
export async function POST(request: Request) {
  const { user, supabase } = await getCallerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: role } = await supabase
    .from('user_roles').select('is_admin').eq('user_id', user.id).single()
  if (!role?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const userIds: string[] = body.userIds
    ?? (body.userId ? [body.userId] : [])

  if (userIds.length === 0) {
    return NextResponse.json({ error: 'Missing userId or userIds' }, { status: 400 })
  }

  const origin = new URL(request.url).origin
  const adminHeaders = {
    'Content-Type': 'application/json',
    'x-admin-user-id': '',          // filled per-user below
    'x-admin-secret': process.env.SUPABASE_SERVICE_ROLE_KEY!,
  }

  const results: Record<string, { ok: boolean; error?: string }> = {}
  const adminDb = getAdminClient()

  // Run users sequentially to avoid hammering the AI APIs
  for (const uid of userIds) {
    const h = { ...adminHeaders, 'x-admin-user-id': uid }
    try {
      // Layer 2: capture a pre-scan snapshot before this partial re-scan runs.
      await captureSnapshot(adminDb, uid, 'partial')

      // Run the 4 scans in parallel per user
      const [compRes, seoRes, geoRes, trendsRes] = await Promise.allSettled([
        // Competitor auto-discovery is flagged off (lib/flags) — skipped here
        // too so an admin refresh can't quietly re-incur its cost.
        COMPETITOR_AUTODISCOVERY_ENABLED
          ? fetch(`${origin}/api/find-competitors`, { method: 'POST', headers: h })
          : Promise.resolve(null),
        fetch(`${origin}/api/generate-seo-ranking?force=true`, { method: 'POST', headers: h }),
        fetch(`${origin}/api/generate-geo-ranking?force=true`, { method: 'POST', headers: h }),
        fetch(`${origin}/api/generate-trends`,           { method: 'POST', headers: h }),
      ])

      const errors = [compRes, seoRes, geoRes, trendsRes]
        // A null value = a step deliberately skipped by a flag, not a failure.
        .filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value != null && !r.value.ok))
        .map(r => r.status === 'rejected' ? String(r.reason) : `HTTP ${(r as any).value.status}`)

      results[uid] = errors.length === 0
        ? { ok: true }
        : { ok: false, error: errors.join('; ') }
    } catch (e: any) {
      results[uid] = { ok: false, error: e?.message }
    }
  }

  const allOk = Object.values(results).every(r => r.ok)
  return NextResponse.json({ success: allOk, results })
}
