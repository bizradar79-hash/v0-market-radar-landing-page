export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

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

async function verifyAccess(req: Request): Promise<boolean> {
  // Cron secret (Bearer or x-cron-secret)
  const auth = req.headers.get('authorization')
  if (auth === `Bearer ${process.env.CRON_SECRET}` && process.env.CRON_SECRET) return true
  const cronHeader = req.headers.get('x-cron-secret')
  if (cronHeader === process.env.CRON_SECRET && process.env.CRON_SECRET) return true
  // Vercel cron
  if (req.headers.get('x-vercel-cron') === '1') return true
  // Admin session
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

export async function GET(req: Request) {
  return handleRequest(req)
}

export async function POST(req: Request) {
  return handleRequest(req)
}

async function handleRequest(req: Request) {
  const hasAccess = await verifyAccess(req)
  if (!hasAccess) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminDb = getAdminSupabase()
  const now = new Date().toISOString()

  // Find companies due for refresh: next_sync_at in the past (or null), not currently running
  const { data: due, error } = await adminDb
    .from('companies')
    .select('id, name, next_sync_at, last_sync_at, sync_status')
    .or(`next_sync_at.is.null,next_sync_at.lte.${now}`)
    .neq('sync_status', 'running')
    .neq('is_demo', true) // demo company data stays frozen — never auto-scanned
    .order('next_sync_at', { ascending: true, nullsFirst: true })

  if (error) {
    console.error('[cron/weekly-refresh] Query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log(`[cron/weekly-refresh] Found ${due?.length || 0} users due for refresh`)

  // Process up to 3 users per run (each full sync takes 2-4 min)
  const MAX_PER_RUN = 3
  const toProcess = (due || []).slice(0, MAX_PER_RUN)

  const results: Array<{ name: string; id: string; ok: boolean; error?: string }> = []
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || new URL(req.url).origin

  for (const company of toProcess) {
    try {
      console.log(`[cron/weekly-refresh] Starting sync for: ${company.name} (${company.id})`)
      const r = await fetch(`${baseUrl}/api/sync/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': process.env.CRON_SECRET!,
        },
        body: JSON.stringify({ company_id: company.id, force: true, profile: 'weekly' }),
        signal: AbortSignal.timeout(240_000), // 4 min per user
      })
      const data = await r.json().catch(() => ({ error: 'invalid json' }))
      results.push({
        name: company.name,
        id: company.id,
        ok: r.ok,
        error: data.error,
      })
      console.log(`[cron/weekly-refresh] ${company.name}: ${r.ok ? 'OK' : 'FAILED'} (${r.status})`)
    } catch (err: any) {
      console.error(`[cron/weekly-refresh] ${company.name} failed:`, err?.message)
      results.push({ name: company.name, id: company.id, ok: false, error: err?.message })

      // Set next_sync_at to tomorrow so it retries sooner than a full week
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      await adminDb.from('companies').update({
        next_sync_at: tomorrow,
      }).eq('id', company.id)
    }
  }

  const totalDue = due?.length || 0
  const processed = results.length
  const succeeded = results.filter(r => r.ok).length

  console.log(`[cron/weekly-refresh] Done: ${succeeded}/${processed} succeeded, ${totalDue - processed} remaining`)

  return NextResponse.json({
    processed,
    succeeded,
    totalDue,
    remaining: Math.max(0, totalDue - processed),
    results,
  })
}
