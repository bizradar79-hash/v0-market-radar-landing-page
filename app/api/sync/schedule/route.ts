export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { headers } from 'next/headers'

function getAdminSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

export async function POST(request: Request) {
  const reqHeaders = await headers()

  // Allow Vercel Cron (x-vercel-cron header) OR our CRON_SECRET
  const isVercelCron = reqHeaders.get('x-vercel-cron') === '1'
  const hasCronSecret = reqHeaders.get('x-cron-secret') === process.env.CRON_SECRET

  if (!isVercelCron && !hasCronSecret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const adminDb = getAdminSupabase()
  const origin = new URL(request.url).origin

  // Find companies due for sync
  const { data: companies, error } = await adminDb
    .from('companies')
    .select('id')
    .lte('next_sync_at', new Date().toISOString())
    .neq('sync_status', 'running')
    .limit(10) // Max 10 per cron run to stay within timeout

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!companies || companies.length === 0) {
    return NextResponse.json({ message: 'No companies due for sync', count: 0 })
  }

  const results: Array<{ company_id: string; status: string }> = []

  for (const company of companies) {
    try {
      // Fire-and-forget: trigger sync for this company
      // We don't await the full sync (it takes ~2 min) — just trigger it
      fetch(`${origin}/api/sync/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': process.env.CRON_SECRET!,
        },
        body: JSON.stringify({ company_id: company.id, force: false }),
      }).catch(() => {}) // fire-and-forget

      results.push({ company_id: company.id, status: 'triggered' })

      // 500ms stagger to avoid hammering APIs simultaneously
      await new Promise(res => setTimeout(res, 500))
    } catch {
      results.push({ company_id: company.id, status: 'trigger_failed' })
    }
  }

  return NextResponse.json({ triggered: results.length, results })
}

// Also allow GET for easy testing
export async function GET(request: Request) {
  return POST(request)
}
