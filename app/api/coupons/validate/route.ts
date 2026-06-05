export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { validateCoupon, BASE_AMOUNT } from '@/lib/billing/coupons'

function getAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

// POST /api/coupons/validate  { code }
// Auth required. Returns { valid, finalAmount, label } for live price display.
// Does NOT redeem the coupon.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const code: string = body.code || ''
  if (!code.trim()) {
    return NextResponse.json({ valid: false, finalAmount: BASE_AMOUNT, label: '' })
  }

  const result = await validateCoupon(getAdminClient(), code, user.id)
  return NextResponse.json({
    valid: result.valid,
    finalAmount: result.finalAmount,
    label: result.label ?? '',
    discountType: result.discountType ?? null,
    graceMonths: result.graceMonths,
    reason: result.reason ?? null,
  })
}
