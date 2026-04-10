export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextResponse } from 'next/server'
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
  news:        ['/api/generate-news'],
  conferences: ['/api/generate-conferences'],
  tenders:     ['/api/generate-tenders'],
  competitors: ['/api/find-competitors'],
  seo:         ['/api/generate-seo-ranking'],
  geo:         ['/api/generate-geo-ranking'],
  trends:      ['/api/industry-trends', '/api/competitor-trends'],
  reviews:     ['/api/analyze-company-reviews'],
  report:      ['/api/generate-weekly-report'],
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

  // Verify company exists
  const adminDb = getAdminSupabase()
  const { data: company } = await adminDb
    .from('companies').select('id, name').eq('id', company_id).single()
  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  const origin = new URL(request.url).origin
  const adminHeaders = {
    'Content-Type': 'application/json',
    'x-admin-user-id': company_id,
    'x-admin-secret': process.env.SUPABASE_SERVICE_ROLE_KEY!,
  }

  const results: { route: string; ok: boolean; status: number; body?: any }[] = []

  for (const route of routes) {
    const sep = route.includes('?') ? '&' : '?'
    const url = `${origin}${route}${sep}force=true`
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({}),
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
