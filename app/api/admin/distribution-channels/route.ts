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

// GET /api/admin/distribution-channels?company_id=... → { distributionChannels: string[] }
export async function GET(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied

  const companyId = new URL(request.url).searchParams.get('company_id')
  if (!companyId) return NextResponse.json({ error: 'Missing company_id' }, { status: 400 })

  const adminDb = getAdminSupabase()
  const { data: company, error } = await adminDb
    .from('companies').select('name, business_profile, distribution_channels').eq('id', companyId).single()
  if (error || !company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  const bp = (company.business_profile ?? null) as { distributionChannels?: string[] } | null
  // Prefer the blob; fall back to the mirrored column.
  const distributionChannels = Array.isArray(bp?.distributionChannels)
    ? bp!.distributionChannels!
    : Array.isArray((company as any).distribution_channels)
      ? (company as any).distribution_channels
      : []
  return NextResponse.json({ success: true, company_name: company.name, distributionChannels })
}

// POST /api/admin/distribution-channels  { company_id, distributionChannels: string[] }
// Writes business_profile.distributionChannels AND mirrors the
// companies.distribution_channels column (same mirror update-business-profile
// does), so the dashboard/profile consumers stay in sync.
export async function POST(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied

  const body = await request.json().catch(() => ({}))
  const { company_id } = body
  if (!company_id) return NextResponse.json({ error: 'Missing company_id' }, { status: 400 })

  const distributionChannels: string[] = Array.isArray(body.distributionChannels)
    ? body.distributionChannels
        .map((q: any) => (typeof q === 'string' ? q.trim() : ''))
        .filter((q: string) => q.length >= 1)
        .slice(0, 20)
    : []

  const adminDb = getAdminSupabase()
  const { data: company, error } = await adminDb
    .from('companies').select('business_profile').eq('id', company_id).single()
  if (error || !company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  const bp = (company.business_profile ?? {}) as Record<string, any>
  const updatedProfile = { ...bp, distributionChannels }

  const { error: saveError } = await adminDb
    .from('companies')
    .update({ business_profile: updatedProfile, distribution_channels: distributionChannels } as any)
    .eq('id', company_id)
  if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 })

  return NextResponse.json({ success: true, distributionChannels })
}
