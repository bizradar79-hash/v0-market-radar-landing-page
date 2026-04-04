export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const secret = new URL(request.url).searchParams.get('token')
  if (secret !== 'mkt-radar-clear-2026') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { error, count } = await supabase
    .from('companies')
    .update({ review_analysis: null })
    .neq('id', '00000000-0000-0000-0000-000000000000') // match all rows

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, rows_cleared: count })
}
