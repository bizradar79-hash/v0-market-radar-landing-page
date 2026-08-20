export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { MAX_DIRECT_COMPETITORS } from '@/lib/flags'

function adminDb() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

/**
 * Progress for a BACKGROUND competitor-tracking run.
 *
 * The run returns its HTTP response immediately and continues in after(), so
 * the admin screen has no completion signal to await. It polls this instead:
 * for each configured competitor, has a row been written since the run started?
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: role } = await supabase
    .from('user_roles').select('is_admin').eq('user_id', user.id).single()
  if (!role?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(request.url)
  const companyId = url.searchParams.get('company_id')
  // Anything written at/after this ISO timestamp belongs to the current run.
  const since = url.searchParams.get('since') || ''
  if (!companyId) return NextResponse.json({ error: 'Missing company_id' }, { status: 400 })

  const db = adminDb()
  const [{ data: company }, { data: rows }] = await Promise.all([
    db.from('companies').select('business_profile').eq('id', companyId).single(),
    db.from('competitor_tracking')
      .select('competitor_name, sources, reviews, scanned_at')
      .eq('company_id', companyId),
  ])

  const bp: any = company?.business_profile || {}
  const names: string[] = (Array.isArray(bp.directCompetitors) ? bp.directCompetitors : [])
    .map((n: any) => String(n || '').trim()).filter(Boolean).slice(0, MAX_DIRECT_COMPETITORS)

  const sinceMs = since ? new Date(since).getTime() : 0
  const byName = new Map((rows || []).map((r: any) => [r.competitor_name, r]))

  const competitors = names.map((name) => {
    const r: any = byName.get(name)
    const scannedMs = r?.scanned_at ? new Date(r.scanned_at).getTime() : 0
    const doneThisRun = !!r && (!sinceMs || scannedMs >= sinceMs - 2000)
    const okSources = (r?.sources || []).filter((s: any) => s.status === 'ok').length
    const processing = (r?.sources || []).filter((s: any) => s.status === 'processing').length
    return {
      name,
      done: doneThisRun,
      scannedAt: r?.scanned_at || null,
      sourcesOk: okSources,
      sourcesProcessing: processing,
      reviewsFound: !!r?.reviews?.found,
      reviewsError: r?.reviews?.found ? null : (r?.reviews?.error || null),
    }
  })

  const done = competitors.filter((c) => c.done).length
  return NextResponse.json({
    success: true,
    total: names.length,
    done,
    finished: names.length > 0 && done >= names.length,
    competitors,
  })
}
