export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'

function adminDb() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

async function requireAdmin(): Promise<NextResponse | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: role } = await supabase
    .from('user_roles').select('is_admin').eq('user_id', user.id).single()
  if (!role?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}

// GET /api/admin/client-items?company_id=... → current VISIBLE items per type.
// Admin-only; used by the impersonate "content" dialog to choose what to hide.
// (Hidden items are already removed from these tables/blobs, so they don't show
// here — the separate hidden-items list surfaces them for restore.)
export async function GET(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied

  const companyId = new URL(request.url).searchParams.get('company_id')
  if (!companyId) return NextResponse.json({ error: 'Missing company_id' }, { status: 400 })

  const db = adminDb()
  const [
    { data: tenders }, { data: conferences }, { data: leads },
    { data: news }, { data: competitors }, { data: company },
  ] = await Promise.all([
    db.from('tenders').select('id, title, organization, deadline, relevance_score').eq('company_id', companyId),
    db.from('conferences').select('id, name, date, location').eq('company_id', companyId),
    db.from('leads').select('id, name, source, industry, score').eq('company_id', companyId),
    db.from('news').select('id, title, source, category').eq('company_id', companyId).order('published_at', { ascending: false }),
    db.from('competitors').select('id, name, threat_score').eq('company_id', companyId).order('threat_score', { ascending: false }),
    db.from('companies').select('distribution_channels, keyword_trends').eq('id', companyId).single(),
  ])

  const channels: string[] = Array.isArray(company?.distribution_channels) ? company!.distribution_channels : []
  const ktMap: Record<string, any> = company?.keyword_trends && typeof company.keyword_trends === 'object' ? company.keyword_trends : {}
  const trends = Object.entries(ktMap)
    .filter(([, v]: any) => v && typeof v.searchVolume === 'number')
    .map(([k, v]: any) => ({ label: v.keyword || k, searchVolume: v.searchVolume, direction: v.direction }))
    .sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0))

  return NextResponse.json({
    success: true,
    items: {
      tender: (tenders || []).map((t: any) => ({ label: t.title, sub: [t.organization, t.relevance_score != null ? `${t.relevance_score}%` : ''].filter(Boolean).join(' · ') })),
      conference: (conferences || []).map((c: any) => ({ label: c.name, sub: [c.date, c.location].filter(Boolean).join(' · ') })),
      lead: (leads || []).map((l: any) => ({ label: l.name, sub: [l.source || l.industry, l.score != null ? `ציון ${l.score}` : ''].filter(Boolean).join(' · ') })),
      news: (news || []).map((n: any) => ({ label: n.title, sub: [n.source, n.category].filter(Boolean).join(' · ') })),
      competitor: (competitors || []).map((c: any) => ({ label: c.name, sub: c.threat_score != null ? `איום ${c.threat_score}` : '' })),
      channel: channels.map((c: string) => ({ label: c, sub: '' })),
      trend: trends.map((t) => ({ label: t.label, sub: `${(t.searchVolume ?? 0).toLocaleString('he-IL')} חיפושים` })),
    },
  })
}
