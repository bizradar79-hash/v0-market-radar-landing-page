export const dynamic = 'force-dynamic'

import { createServerClient } from '@supabase/ssr'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { assembleReport } from '@/lib/report/assemble'
import ReportView from '@/components/report/ReportView'

// Private-ish content behind an unguessable token — keep it out of search.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'North Star Radar — דוח שבועי',
}

function adminDb() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

export default async function ReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token || token.length < 12) notFound()

  let company: any = null
  try {
    const { data } = await adminDb()
      .from('companies')
      .select('id, name, city, geographic_area, geographic_scope, next_sync_at, last_sync_at, weekly_actions, seo_ranking, geo_ranking, keyword_trends, competitor_trends, industry_trends, business_profile')
      .eq('report_token', token)
      .single()
    company = data
  } catch {
    company = null
  }
  if (!company) notFound()

  // Permanent link = LIVE latest data (assembled fresh from the stored scan).
  const r = await assembleReport(adminDb(), company.id, company)
  return <ReportView data={r} />
}
