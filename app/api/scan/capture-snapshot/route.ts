export const dynamic = 'force-dynamic'

import { getFullContext } from '@/lib/context'
import { createServerClient } from '@supabase/ssr'
import { captureSnapshot, type ScanTrigger } from '@/lib/scan/snapshot'
import { NextResponse } from 'next/server'

function getAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

// POST /api/scan/capture-snapshot — capture a pre-scan snapshot for the
// authenticated company. Used by the client-side onboarding initial scan.
export async function POST(request: Request) {
  const ctx = await getFullContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const trigger: ScanTrigger = body.trigger === 'full' || body.trigger === 'partial'
    ? body.trigger : 'initial'

  // Snapshot capture needs service-role to read across modules + write the row.
  const id = await captureSnapshot(getAdminClient(), ctx.user.id, trigger)
  return NextResponse.json({ success: true, snapshot_id: id })
}
