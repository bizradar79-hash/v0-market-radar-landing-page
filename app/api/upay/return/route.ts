export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { BASE_AMOUNT } from '@/lib/billing/coupons'

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

// Best-effort: find an auth user id by email (first page only — pending lists
// are tiny). Used only as a fallback when the session user is missing.
async function findUserIdByEmail(adminDb: any, email: string): Promise<string | null> {
  try {
    const { data } = await adminDb.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const match = (data?.users ?? []).find(
      (u: any) => (u.email || '').toLowerCase() === email.toLowerCase(),
    )
    return match?.id ?? null
  } catch {
    return null
  }
}

// POST /api/upay/return — process the params Upay appends to the return URL.
// SUCCESS → provisionally auto-activate (auto_confirmed=true), idempotent on
// transaction_id, with an amount sanity-check that routes mismatches to manual
// review instead of granting access.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))

  const errordescription = String(body.errordescription ?? '')
  const providererrorcode = String(body.providererrorcode ?? '')
  const transactionId = body.transactionid ? String(body.transactionid) : null
  const providerConfirmation = body.providerconfirmationnumber ? String(body.providerconfirmationnumber) : null
  const fourDigits = body.fourdigits ? String(body.fourdigits) : null
  const emailParam = body.email ? String(body.email) : null
  const amountRaw = body.amount
  const paidAmount = amountRaw != null && amountRaw !== '' ? Number(amountRaw) : null

  const isSuccess =
    errordescription.toUpperCase() === 'SUCCESS' || providererrorcode === '0'

  const adminDb = getAdminClient()

  // ── Resolve the subscription (logged-in user first, then email fallback) ──
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let userId = user?.id ?? null
  if (!userId && emailParam) {
    userId = await findUserIdByEmail(adminDb, emailParam)
  }

  let sub: any = null
  if (userId) {
    const { data } = await adminDb
      .from('subscriptions').select('*').eq('user_id', userId).maybeSingle()
    sub = data
  }

  // ── Idempotency: same transaction already activated → no-op ────────────────
  if (sub && sub.status === 'active' && transactionId && sub.transaction_id === transactionId) {
    return NextResponse.json({ ok: true, status: 'active', alreadyProcessed: true })
  }

  // ── Failure params: leave pending, ask the user to retry ──────────────────
  if (!isSuccess) {
    return NextResponse.json({ ok: false, reason: 'not_success' })
  }

  if (!sub) {
    // Payment likely succeeded but we couldn't match a subscription — surface
    // for manual reconciliation rather than activating blindly.
    console.error('[upay/return] SUCCESS but no subscription matched', { transactionId, emailParam })
    return NextResponse.json({ ok: false, reason: 'no_subscription' })
  }

  // Record transaction details regardless of the activation decision below.
  const txMeta = {
    transaction_id: transactionId,
    provider_confirmation: providerConfirmation,
    four_digits: fourDigits,
    paid_amount: paidAmount,
  }

  // ── Amount sanity-check (spoof guard) ─────────────────────────────────────
  const expectedAmount = Number(sub.final_amount ?? sub.base_amount ?? BASE_AMOUNT)
  if (paidAmount != null && Math.abs(paidAmount - expectedAmount) > 0.5) {
    await adminDb.from('subscriptions').update({
      ...txMeta,
      status: 'pending_payment',
      review_flag: 'amount_mismatch',
    }).eq('id', sub.id)
    console.error('[upay/return] amount mismatch — manual review', {
      transactionId, paidAmount, expectedAmount, userId,
    })
    return NextResponse.json({ ok: false, reason: 'amount_mismatch' })
  }

  // ── Auto-confirm toggle (can disable fast via env) ────────────────────────
  const autoConfirm = (process.env.AUTO_CONFIRM_ON_RETURN ?? 'true') !== 'false'
  if (!autoConfirm) {
    await adminDb.from('subscriptions').update({
      ...txMeta,
      // Stay pending so an admin confirms manually, but keep the tx details.
      review_flag: 'auto_confirm_disabled',
    }).eq('id', sub.id)
    return NextResponse.json({ ok: true, review: true })
  }

  // ── Activate (provisional / auto_confirmed) ───────────────────────────────
  const periodEnd = addMonths(new Date(), 1)
  const { error: upErr } = await adminDb.from('subscriptions').update({
    ...txMeta,
    status: 'active',
    final_amount: sub.final_amount ?? paidAmount ?? BASE_AMOUNT,
    current_period_end: periodEnd.toISOString(),
    auto_confirmed: true,
    confirmed_at: new Date().toISOString(),
    review_flag: null,
  }).eq('id', sub.id)

  if (upErr) {
    return NextResponse.json({ ok: false, reason: upErr.message }, { status: 500 })
  }

  // ── Coupon redemption (idempotent) ────────────────────────────────────────
  if (sub.coupon_code) {
    try {
      const { data: coupon } = await adminDb
        .from('coupons').select('times_redeemed').eq('code', sub.coupon_code).maybeSingle()
      await adminDb.from('coupons')
        .update({ times_redeemed: (coupon?.times_redeemed ?? 0) + 1 })
        .eq('code', sub.coupon_code)
      await adminDb.from('coupon_redemptions')
        .upsert({ coupon_code: sub.coupon_code, user_id: sub.user_id }, { onConflict: 'coupon_code,user_id' })
    } catch (e: any) {
      console.error('[upay/return] coupon redemption failed:', e?.message)
    }
  }

  return NextResponse.json({ ok: true, status: 'active' })
}
