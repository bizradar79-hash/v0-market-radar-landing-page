export const dynamic = 'force-dynamic'

import { createServerClient } from '@supabase/ssr'
import type { Metadata } from 'next'
import { assembleReport } from '@/lib/report/assemble'
import { DEMO_REPORT } from '@/lib/report/demo-data'
import ReportView from '@/components/report/ReportView'

// Public sample report — indexable (it's a marketing asset, not private client data).
export const metadata: Metadata = {
  title: 'North Star Radar — דוח לדוגמה',
  description: 'דוח שוק שבועי לדוגמה — כל מה שקורה בשוק שלך בדוח אחד: מכרזים, שותפים, מתחרים, והדירוג שלך בגוגל וב-AI.',
}

function adminDb() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

// Prefer a seeded is_demo company's LIVE assembled report; fall back to the frozen
// crafted demo data so the sample ALWAYS renders (even before the seed is applied).
export default async function DemoReportPage() {
  let data = DEMO_REPORT
  try {
    const { data: company } = await adminDb()
      .from('companies')
      .select('id, name, city, geographic_area, geographic_scope, next_sync_at, last_sync_at, weekly_actions, seo_ranking, geo_ranking, keyword_trends, competitor_trends, business_profile')
      .eq('is_demo', true)
      .limit(1)
      .single()
    if (company) data = await assembleReport(adminDb(), company.id, company)
  } catch {
    data = DEMO_REPORT
  }

  return <ReportView data={data} example={{ label: 'עסק להמחשה' }} />
}
