export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[cron/enrich] Triggering URL enrichment...')

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.nsradar.co.il'
  const res = await fetch(`${baseUrl}/api/admin/tenders-engine/enrich-urls`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.CRON_SECRET}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(290000),
  })

  const data = await res.json()
  console.log('[cron/enrich] Result:', JSON.stringify(data))

  return NextResponse.json(data)
}
