export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const keywords: string[] = (ctx.company?.keywords || []).slice(0, 5)
    if (keywords.length === 0) return NextResponse.json({ success: true, processed: 0 })

    // Use request URL origin — never falls back to localhost in production
    const origin = new URL(request.url).origin
    const adminHeaders = {
      'Content-Type': 'application/json',
      'x-admin-user-id': ctx.user.id,
      'x-admin-secret': process.env.SUPABASE_SERVICE_ROLE_KEY!,
    }

    console.log(`[scan-keyword-trends] processing ${keywords.length} keywords: ${keywords.join(', ')}`)

    let processed = 0
    const results: Record<string, number> = {}

    for (const keyword of keywords) {
      try {
        const res = await fetch(`${origin}/api/generate-keyword-trends?force=true`, {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify({ keyword, force: true }),
        })
        if (res.ok) {
          const data = await res.json().catch(() => ({}))
          const trendsCount = (data.israel || data.trends || []).length
          results[keyword] = trendsCount
          console.log(`[scan-keyword-trends] "${keyword}" → ${trendsCount} trends`)
          processed++
        } else {
          const errBody = await res.text().catch(() => '')
          console.error(`[scan-keyword-trends] "${keyword}" failed: HTTP ${res.status} — ${errBody.slice(0, 200)}`)
        }
      } catch (e: any) {
        console.error(`[scan-keyword-trends] "${keyword}" error:`, e?.message)
      }
    }

    console.log(`[scan-keyword-trends] done: ${processed}/${keywords.length} succeeded`, results)
    return NextResponse.json({ success: true, processed, results })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
