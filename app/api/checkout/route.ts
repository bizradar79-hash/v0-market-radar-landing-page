export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { validateCoupon, normalizeCode, BASE_AMOUNT } from '@/lib/billing/coupons'
import { paymentProvider } from '@/lib/billing/provider'

function getAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

// POST /api/checkout  { code? }
// Auth required. Re-validates the coupon server-side (NEVER trusts a client
// amount). Free/grace activates immediately; paid returns a Upay redirect URL
// and parks the subscription as pending_payment for manual admin confirmation.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminDb = getAdminClient()
  const body = await request.json().catch(() => ({}))
  const rawCode: string = body.code || ''

  // ── Re-validate coupon server-side ────────────────────────────────────────
  let finalAmount = BASE_AMOUNT
  let couponCode: string | null = null
  let graceMonths = 0
  let discountType: string | null = null
  let paymentUrl: string | null = null

  if (rawCode.trim()) {
    const v = await validateCoupon(adminDb, rawCode, user.id)
    if (!v.valid) {
      return NextResponse.json({ error: 'הקופון אינו תקף', reason: v.reason }, { status: 400 })
    }
    finalAmount = v.finalAmount
    couponCode = normalizeCode(rawCode)
    graceMonths = v.graceMonths
    discountType = v.discountType ?? null
    paymentUrl = v.paymentUrl ?? null
  }

  const now = new Date()

  // ── Free / grace: activate immediately, no Upay ───────────────────────────
  if (finalAmount === 0) {
    const isGrace = graceMonths > 0
    const periodEnd = addMonths(now, graceMonths || 1)

    const { error: upErr } = await adminDb.from('subscriptions').upsert({
      user_id: user.id,
      status: isGrace ? 'grace' : 'active',
      base_amount: BASE_AMOUNT,
      final_amount: 0,
      coupon_code: couponCode,
      provider: 'upay',
      current_period_end: periodEnd.toISOString(),
    }, { onConflict: 'user_id' })

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 })
    }

    if (couponCode) {
      await redeemCoupon(adminDb, couponCode, user.id)
    }

    return NextResponse.json({ redirect: '/onboarding' })
  }

  // ── Paid: park as pending_payment, then build the Upay redirect ───────────
  const { error: upErr } = await adminDb.from('subscriptions').upsert({
    user_id: user.id,
    status: 'pending_payment',
    base_amount: BASE_AMOUNT,
    final_amount: finalAmount,
    coupon_code: couponCode,
    provider: 'upay',
  }, { onConflict: 'user_id' })

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  try {
    const checkout = await paymentProvider.createCheckout({
      userId: user.id,
      coupon: couponCode ? { discount_type: discountType ?? '', payment_url: paymentUrl } : null,
      finalAmount,
      graceMonths,
    })

    if (checkout.mode === 'activated') {
      // Shouldn't happen for finalAmount > 0, but handle defensively.
      return NextResponse.json({ redirect: '/onboarding' })
    }
    return NextResponse.json({ url: checkout.url })
  } catch (e: any) {
    if (e?.message === 'coupon_misconfigured') {
      return NextResponse.json({ error: 'מבצע לא זמין כרגע' }, { status: 400 })
    }
    if (e?.message === 'upay_base_url_missing') {
      // Full-price Upay link not configured — better to block than charge ₪0.
      console.error('[checkout] UPAY_STATIC_PAYMENT_URL is not set — full-price checkout blocked')
      return NextResponse.json({ error: 'התשלום אינו זמין כרגע, נסה שוב מאוחר יותר' }, { status: 503 })
    }
    return NextResponse.json({ error: e?.message ?? 'checkout_failed' }, { status: 500 })
  }
}

// Increment times_redeemed + record the per-user redemption (idempotent).
async function redeemCoupon(adminDb: any, code: string, userId: string) {
  try {
    const { data: coupon } = await adminDb
      .from('coupons').select('times_redeemed').eq('code', code).maybeSingle()
    await adminDb.from('coupons')
      .update({ times_redeemed: (coupon?.times_redeemed ?? 0) + 1 })
      .eq('code', code)
    await adminDb.from('coupon_redemptions')
      .upsert({ coupon_code: code, user_id: userId }, { onConflict: 'coupon_code,user_id' })
  } catch (e: any) {
    console.error('[checkout] redeemCoupon failed:', e?.message)
  }
}
