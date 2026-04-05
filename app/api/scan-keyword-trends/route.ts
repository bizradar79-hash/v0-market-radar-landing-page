export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const keywords: string[] = (ctx.company?.keywords || []).slice(0, 8)
    if (keywords.length === 0) return NextResponse.json({ success: true, processed: 0 })

    const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const adminHeaders = {
      'Content-Type': 'application/json',
      'x-admin-user-id': ctx.user.id,
      'x-admin-secret': process.env.SUPABASE_SERVICE_ROLE_KEY!,
    }

    let processed = 0
    for (const keyword of keywords) {
      try {
        await fetch(`${origin}/api/generate-keyword-trends?force=true`, {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify({ keyword, force: true }),
        })
        processed++
      } catch {
        // continue on individual failure
      }
    }

    return NextResponse.json({ success: true, processed })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
