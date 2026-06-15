export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

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

// Verify the caller is an admin (session-based). Returns null if OK, or a
// NextResponse error to return early.
async function requireAdmin(): Promise<NextResponse | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: role } = await supabase
    .from('user_roles').select('is_admin').eq('user_id', user.id).single()
  if (!role?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}

// GET /api/admin/geo-queries?company_id=... → { geoQueries: string[] }
export async function GET(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied

  const companyId = new URL(request.url).searchParams.get('company_id')
  if (!companyId) return NextResponse.json({ error: 'Missing company_id' }, { status: 400 })

  const adminDb = getAdminSupabase()
  const { data: company, error } = await adminDb
    .from('companies').select('name, business_profile').eq('id', companyId).single()
  if (error || !company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  const bp = (company.business_profile ?? null) as { geoQueries?: string[] } | null
  const geoQueries = Array.isArray(bp?.geoQueries) ? bp!.geoQueries! : []
  return NextResponse.json({ success: true, company_name: company.name, geoQueries })
}

// POST /api/admin/geo-queries  { company_id, geoQueries: string[] }
// Merges geoQueries into the existing business_profile (never clobbers other fields).
export async function POST(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied

  const body = await request.json().catch(() => ({}))
  const { company_id } = body
  if (!company_id) return NextResponse.json({ error: 'Missing company_id' }, { status: 400 })

  const geoQueries: string[] = Array.isArray(body.geoQueries)
    ? body.geoQueries
        .map((q: any) => (typeof q === 'string' ? q.trim() : ''))
        .filter((q: string) => q.length >= 3)
        .slice(0, 10)
    : []

  const adminDb = getAdminSupabase()
  const { data: company, error } = await adminDb
    .from('companies').select('business_profile').eq('id', company_id).single()
  if (error || !company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  const bp = (company.business_profile ?? {}) as Record<string, any>
  const updatedProfile = { ...bp, geoQueries }

  const { error: saveError } = await adminDb
    .from('companies').update({ business_profile: updatedProfile }).eq('id', company_id)
  if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 })

  return NextResponse.json({ success: true, geoQueries })
}
