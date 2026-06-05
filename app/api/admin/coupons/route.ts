export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { normalizeCode, computeFinalAmount, BASE_AMOUNT, type DiscountType } from '@/lib/billing/coupons'

function getAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const }
  const { data: role } = await supabase
    .from('user_roles').select('is_admin').eq('user_id', user.id).single()
  if (!role?.is_admin) return { error: 'Forbidden', status: 403 as const }
  return { user }
}

const PAID_TYPES: DiscountType[] = ['percent', 'fixed']

// GET — list coupons with computed price + redemption details.
export async function GET() {
  const auth = await requireAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const adminDb = getAdminClient()
  const { data: coupons, error } = await adminDb
    .from('coupons').select('*').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: redemptions } = await adminDb
    .from('coupon_redemptions').select('coupon_code, user_id, redeemed_at')

  const enriched = (coupons ?? []).map((c: any) => ({
    ...c,
    final_price: computeFinalAmount(BASE_AMOUNT, c),
    redemptions: (redemptions ?? []).filter((r: any) => r.coupon_code === c.code),
  }))

  return NextResponse.json({ coupons: enriched })
}

// POST — create or update a coupon (upsert by code).
export async function POST(request: Request) {
  const auth = await requireAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => ({}))
  const code = normalizeCode(body.code || '')
  const discount_type = body.discount_type as DiscountType
  const discount_value = Number(body.discount_value) || 0
  const payment_url = (body.payment_url || '').trim() || null
  const scope = body.scope || 'first_payment'
  const active = body.active !== false
  const expires_at = body.expires_at || null
  const max_redemptions = body.max_redemptions != null && body.max_redemptions !== ''
    ? Number(body.max_redemptions) : null

  if (!code) return NextResponse.json({ error: 'קוד קופון חסר' }, { status: 400 })
  if (!['percent', 'fixed', 'free', 'grace'].includes(discount_type)) {
    return NextResponse.json({ error: 'סוג הנחה לא תקין' }, { status: 400 })
  }

  // payment_url REQUIRED for percent/fixed; must be http(s).
  if (PAID_TYPES.includes(discount_type)) {
    if (!payment_url) {
      return NextResponse.json({ error: 'קישור לדף התשלום (Upay) נדרש עבור קופון בתשלום' }, { status: 400 })
    }
    if (!/^https?:\/\//i.test(payment_url)) {
      return NextResponse.json({ error: 'קישור התשלום חייב להתחיל ב-http(s)://' }, { status: 400 })
    }
  }

  const adminDb = getAdminClient()

  // Preserve times_redeemed on update.
  const { data: existing } = await adminDb
    .from('coupons').select('times_redeemed').eq('code', code).maybeSingle()

  const row = {
    code,
    discount_type,
    discount_value,
    // free/grace ignore payment_url — store null to avoid stale links.
    payment_url: PAID_TYPES.includes(discount_type) ? payment_url : null,
    scope,
    active,
    expires_at,
    max_redemptions,
    times_redeemed: existing?.times_redeemed ?? 0,
  }

  const { error } = await adminDb.from('coupons').upsert(row, { onConflict: 'code' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, code, final_price: computeFinalAmount(BASE_AMOUNT, row) })
}

// DELETE ?code=XXX — remove a coupon.
export async function DELETE(request: Request) {
  const auth = await requireAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const code = normalizeCode(new URL(request.url).searchParams.get('code') || '')
  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 })

  const adminDb = getAdminClient()
  const { error } = await adminDb.from('coupons').delete().eq('code', code)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
