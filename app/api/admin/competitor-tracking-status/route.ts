export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// One competitor can take minutes (async social collections + reviews polling).
export const maxDuration = 300

import { NextResponse, after } from 'next/server'
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
 * Progress + result for competitor runs.
 *
 * A run is triggered by POST and executes server-side, so the UI has no
 * response to await — it polls this instead: for each configured competitor,
 * has a row been written since the run started, and what does it say?
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
      .select('competitor_name, sources, reviews, resolved_links, cost, scanned_at')
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
      // Surfaced so a miss is explainable in the UI without a DB query.
      reviewsRating: r?.reviews?.rating ?? null,
      reviewsCount: r?.reviews?.reviewsCount ?? null,
      reviewsPasses: r?.reviews?.passes || null,
      viaTopResult: !!r?.reviews?.viaTopResult,
      cid: r?.resolved_links?.cid || null,
      costUSD: r?.cost?.totalUSD ?? null,
      sourceDetail: (r?.sources || []).map((s: any) => ({
        source: s.source, status: s.status, postsRecent: s.postsRecent ?? 0, error: s.error || null,
      })),
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

/**
 * POST { company_id, competitor } — TRIGGER a run for ONE competitor.
 *
 * WHY THIS RETURNS IMMEDIATELY: it used to await the inner
 * /api/competitor-tracking call, which can legitimately run for minutes (async
 * BrightData collections + DataForSEO review-task polling). The browser fetch
 * was therefore held open for minutes and the network layer aborted it long
 * before the work finished — surfacing as a bare "Failed to fetch" with no
 * server error to look at.
 *
 * Now: dispatch inside after() (the same shape /api/sync/start uses to launch a
 * scan), return { started: true } in milliseconds, and let the caller poll GET
 * ?company_id=…&since=… for the result. No long-lived request anywhere.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: role } = await supabase
    .from('user_roles').select('is_admin').eq('user_id', user.id).single()
  if (!role?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const companyId = String(body.company_id || '')
  const competitor = String(body.competitor || '')
  if (!companyId || !competitor) {
    return NextResponse.json({ error: 'Missing company_id or competitor' }, { status: 400 })
  }

  const origin = new URL(request.url).origin
  const startedAt = new Date().toISOString()
  const qs = new URLSearchParams({ only: competitor, force: 'true' })

  after(async () => {
    const t0 = Date.now()
    console.log(`[COMPETITOR-INTEL][${competitor}] TRIGGER dispatch company=${companyId}`)
    try {
      const res = await fetch(`${origin}/api/competitor-tracking?${qs}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-user-id': companyId,
          'x-admin-secret': process.env.SUPABASE_SERVICE_ROLE_KEY!,
        },
        body: JSON.stringify({}),
      })
      const txt = await res.text().catch(() => '')
      console.log(`[COMPETITOR-INTEL][${competitor}] TRIGGER done http=${res.status} in ${Math.round((Date.now() - t0) / 1000)}s body=${txt.slice(0, 400)}`)
    } catch (e: any) {
      console.error(`[COMPETITOR-INTEL][${competitor}] TRIGGER FAILED after ${Math.round((Date.now() - t0) / 1000)}s:`, e?.message)
    }
  })

  return NextResponse.json({ started: true, competitor, startedAt })
}
