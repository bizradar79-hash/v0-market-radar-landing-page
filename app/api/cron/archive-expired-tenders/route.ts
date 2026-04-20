export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = new Date().toISOString().split('T')[0]
  console.log('[cron/archive] Running archive for date:', today)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return [] },
        setAll() {},
      },
    }
  )

  const { data, error, count } = await supabase
    .from('tender_pool')
    .update({ status: 'closed' })
    .eq('status', 'open')
    .lt('deadline', today)
    .select('id', { count: 'exact' })

  const archivedCount = count ?? data?.length ?? 0
  console.log('[cron/archive] Archived', archivedCount, 'tenders. Error:', error?.message || 'none')

  return NextResponse.json({
    success: true,
    archivedCount,
    date: today,
    error: error?.message || null,
  })
}
