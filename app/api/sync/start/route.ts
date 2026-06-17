export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse, after } from 'next/server'
import { getFullContext } from '@/lib/context'

// User-facing trigger for the INITIAL (onboarding) scan. The browser can't call
// /api/sync/run directly — that route requires admin/cron auth, and the cron
// secret must never reach the client. This endpoint authenticates the user
// (cookies OR Bearer token, via getFullContext) and then fires /api/sync/run
// SERVER-SIDE with the cron secret, fire-and-forget. The scan then runs in
// sync/run's after() + chaining, so it survives the user closing their tab.
export async function POST(request: Request) {
  const ctx = await getFullContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const origin = new URL(request.url).origin
  const companyId = ctx.user.id

  // Trigger the FULL initial scan for THIS user's company. force:true so it runs
  // now regardless of next_sync_at; profile:'initial' for the rich set. Run the
  // trigger in after() so the serverless function reliably dispatches it after
  // the response returns (not frozen mid-flight). sync/run itself then runs in
  // its own after() + chaining — independent of the browser.
  after(async () => {
    try {
      await fetch(`${origin}/api/sync/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': process.env.CRON_SECRET || '',
        },
        body: JSON.stringify({ company_id: companyId, profile: 'initial', force: true }),
      })
    } catch (e: any) {
      console.error('[sync/start] failed to trigger sync/run:', e?.message)
    }
  })

  return NextResponse.json({ started: true })
}
