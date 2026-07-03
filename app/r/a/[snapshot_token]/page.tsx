export const dynamic = 'force-dynamic'

import { createServerClient } from '@supabase/ssr'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import type { ReportData } from '@/lib/report/assemble'
import ReportView from '@/components/report/ReportView'

// Archived (frozen) report — private-ish behind an unguessable token, noindex.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'North Star Radar — דוח ארכיון',
}

function adminDb() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

export default async function ArchiveReportPage({ params }: { params: Promise<{ snapshot_token: string }> }) {
  const { snapshot_token } = await params
  if (!snapshot_token || snapshot_token.length < 12) notFound()

  let snapshot: { data: ReportData; label: string | null; created_at: string } | null = null
  try {
    const { data } = await adminDb()
      .from('report_snapshots')
      .select('data, label, created_at')
      .eq('snapshot_token', snapshot_token)
      .single()
    snapshot = (data as any) ?? null
  } catch {
    snapshot = null
  }
  if (!snapshot?.data) notFound()

  // Render the FROZEN data (not live) with an archive badge.
  const label = snapshot.label
    || (snapshot.created_at ? new Date(snapshot.created_at).toLocaleDateString('he-IL') : '')
  return <ReportView data={snapshot.data} archive={{ label }} />
}
