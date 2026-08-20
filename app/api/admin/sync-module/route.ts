export const dynamic = 'force-dynamic'
// 300s: competitor tracking genuinely takes minutes (async BrightData
// collections poll to ready per competitor). 120s would have cut it off.
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { COMPETITOR_AUTODISCOVERY_ENABLED } from '@/lib/flags'
import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'

function getAdminSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

// Map module id → API path(s) to call
const MODULE_ROUTES: Record<string, string[]> = {
  news:           ['/api/generate-news'],
  conferences:    ['/api/generate-conferences'],
  tenders:        ['/api/find-tenders'],
  // Old competitor module — gated (lib/flags). Auto-discovery is dropped from
  // the chain unless explicitly re-enabled; seeding manual names still works.
  competitors: [
    '/api/sync-profile-competitors',
    ...(COMPETITOR_AUTODISCOVERY_ENABLED ? ['/api/find-competitors'] : []),
  ],
  // NEW competitor module — an admin refresh FORCES a fresh run (re-resolves
  // links and bypasses the staleness gate), which is the point of the button.
  // This is the ONLY competitor entry reachable from the module-sync screen;
  // `competitors` above is the old, disabled engine.
  // background=true → the route returns immediately and finishes the loop in
  // after(), so the run survives the admin closing the dialog or the tab. This
  // is the same pattern /api/sync/start uses for the onboarding scan.
  competitor_tracking: ['/api/competitor-tracking?force=true&background=true'],
  // Leads — distribution-channel-driven partner search (or customer fallback).
  // force=true here bypasses the route's 7-day cache AND the sync/run ≥5-leads
  // skip, so re-running after editing channels actually regenerates.
  leads:          ['/api/generate-leads'],
  seo:            ['/api/generate-seo-ranking'],
  geo:            ['/api/generate-geo-ranking'],
  // The grouped `trends` button fans out to ALL THREE trend modules — including
  // keyword_trends (DataForSEO Google Ads). It was previously missing from this
  // fan-out, so clicking "trends" never invoked generate-keyword-trends and the
  // data always showed "—"/"AI estimated". The three keys below also expose each
  // trend module as an independently-runnable button.
  trends:         ['/api/industry-trends', '/api/competitor-trends', '/api/generate-keyword-trends'],
  industry_trends:   ['/api/industry-trends'],
  competitor_trends: ['/api/competitor-trends'],
  keyword_trends:    ['/api/generate-keyword-trends'],
  reviews:        ['/api/sync-competitor-ratings', '/api/analyze-company-reviews'],
  report:         ['/api/generate-weekly-report'],
}

// Tables to clear before regenerating (cache bust)
const MODULE_TABLES: Record<string, string> = {
  news:        'news',
  conferences: 'conferences',
  tenders:     'tenders',
}

export async function POST(request: Request) {
  // Verify admin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: role } = await supabase
    .from('user_roles').select('is_admin').eq('user_id', user.id).single()
  if (!role?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const { company_id, module } = body

  if (!company_id || !module) {
    return NextResponse.json({ error: 'Missing company_id or module' }, { status: 400 })
  }

  const routes = MODULE_ROUTES[module]
  if (!routes) {
    return NextResponse.json({ error: `Unknown module: ${module}` }, { status: 400 })
  }

  // Verify company exists (also pull keywords — generate-keyword-trends needs
  // them passed explicitly in the body, it does NOT read them from the company).
  const adminDb = getAdminSupabase()
  const { data: company } = await adminDb
    .from('companies').select('id, name, keywords').eq('id', company_id).single()
  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  const origin = new URL(request.url).origin
  const adminHeaders = {
    'Content-Type': 'application/json',
    'x-admin-user-id': company_id,
    'x-admin-secret': process.env.SUPABASE_SERVICE_ROLE_KEY!,
  }

  // Clear cached table rows before regenerating
  const tableToDelete = MODULE_TABLES[module]
  if (tableToDelete) {
    await adminDb.from(tableToDelete).delete().eq('company_id', company_id)
    console.log(`[sync-module] cleared ${tableToDelete} for company ${company_id}`)
  }

  const results: { route: string; ok: boolean; status: number; body?: any }[] = []

  for (const route of routes) {
    const sep = route.includes('?') ? '&' : '?'
    const url = `${origin}${route}${sep}force=true`
    // generate-keyword-trends needs the keyword list in the body (empty body →
    // 400 "Missing keyword"); every other module reads context from the company.
    const reqBody = route.includes('/api/generate-keyword-trends')
      ? { keywords: ((company as any).keywords || []).slice(0, 8), force: true }
      : {}
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify(reqBody),
      })
      let resBody: any
      try { resBody = await res.json() } catch { resBody = {} }
      results.push({ route, ok: res.ok, status: res.status, body: resBody })
    } catch (e: any) {
      results.push({ route, ok: false, status: 0, body: { error: e?.message } })
    }
  }

  const allOk = results.every(r => r.ok)
  return NextResponse.json({
    success: allOk,
    module,
    company_id,
    company_name: company.name,
    results,
  }, { status: allOk ? 200 : 207 })
}
