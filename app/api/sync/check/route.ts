export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ skip: true })

  const { data } = await supabase
    .from('companies')
    .select('next_sync_at, sync_status')
    .eq('id', user.id)
    .single()

  if (!data?.next_sync_at) return NextResponse.json({ skip: true })
  if (data.sync_status === 'running') return NextResponse.json({ skip: true, reason: 'already_running' })
  if (new Date(data.next_sync_at) > new Date()) return NextResponse.json({ skip: true, reason: 'not_due' })

  // Trigger sync fire-and-forget
  const origin = new URL(request.url).origin
  fetch(`${origin}/api/sync/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ company_id: user.id, force: false }),
  }).catch(() => {})

  return NextResponse.json({ triggered: true })
}
