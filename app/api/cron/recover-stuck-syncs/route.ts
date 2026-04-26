export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.nsradar.co.il'
  const res = await fetch(`${baseUrl}/api/admin/recover-stuck-syncs`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.CRON_SECRET}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(30000),
  })

  const data = await res.json()
  console.log('[cron/recover-stuck] Result:', JSON.stringify(data))
  return NextResponse.json(data)
}
