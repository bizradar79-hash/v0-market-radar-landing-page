export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getSubscriptionGate } from '@/lib/billing/subscription'

// GET /api/billing/gate — returns the current user's paywall gate.
// Used by client pages (/onboarding, /app/*) to enforce access when
// PAYWALL_ENFORCED=true. When the paywall is off, hasAccess is always true.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ authenticated: false, hasAccess: false, status: 'none', pendingPayment: false, enforced: false }, { status: 401 })
  }

  const gate = await getSubscriptionGate(supabase, user.id)
  return NextResponse.json({ authenticated: true, ...gate })
}
