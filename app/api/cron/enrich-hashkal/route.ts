export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[cron/enrich-hashkal] Starting enrichment loop...')

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.nsradar.co.il'
  const enrichUrl = `${baseUrl}/api/admin/tenders-engine/enrich-hashkal`
  const headers = {
    'Authorization': `Bearer ${process.env.CRON_SECRET}`,
    'Content-Type': 'application/json',
  }

  let totalSuccess = 0, totalFailed = 0, iteration = 0
  const MAX_ITERS = 20

  while (iteration < MAX_ITERS) {
    iteration++
    try {
      const res = await fetch(enrichUrl, { method: 'POST', headers, signal: AbortSignal.timeout(270000) })
      const data = await res.json()
      totalSuccess += data.enrichedSuccess || 0
      totalFailed += data.failed || 0
      const remaining = data.remaining || 0
      console.log(`[cron/enrich-hashkal] Iteration ${iteration}: processed=${data.processed} success=${data.enrichedSuccess} remaining=${remaining}`)
      if (remaining === 0 || (data.processed || 0) === 0) break
    } catch (e: any) {
      console.error(`[cron/enrich-hashkal] Iteration ${iteration} failed:`, e?.message)
      break
    }
  }

  console.log(`[cron/enrich-hashkal] Done: ${totalSuccess} enriched, ${totalFailed} failed in ${iteration} iterations`)
  return NextResponse.json({ totalSuccess, totalFailed, iterations: iteration })
}
