export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

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

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

// GET — list pending_payment subscriptions enriched with email + company name.
export async function GET() {
  const auth = await requireAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const adminDb = getAdminClient()
  const { data: subs, error } = await adminDb
    .from('subscriptions')
    .select('*')
    .eq('status', 'pending_payment')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Recent activations (incl. auto-confirmed Upay returns) for reconciliation
  // against the Upay dashboard — surfaces transaction id + amount + any flag.
  const { data: activations } = await adminDb
    .from('subscriptions')
    .select('*')
    .in('status', ['active', 'grace'])
    .order('confirmed_at', { ascending: false, nullsFirst: false })
    .limit(50)

  const userIds = [...new Set([
    ...(subs ?? []).map((s: any) => s.user_id),
    ...(activations ?? []).map((s: any) => s.user_id),
  ])]

  // Company names (companies.id = auth.uid)
  const { data: companies } = userIds.length
    ? await adminDb.from('companies').select('id, name').in('id', userIds)
    : { data: [] as any[] }
  const companyById = new Map((companies ?? []).map((c: any) => [c.id, c.name]))

  // Emails via auth admin lookup (small lists).
  const emailById = new Map<string, string>()
  for (const uid of userIds) {
    try {
      const { data } = await adminDb.auth.admin.getUserById(uid as string)
      if (data?.user?.email) emailById.set(uid as string, data.user.email)
    } catch { /* ignore */ }
  }

  const enrich = (s: any) => ({
    ...s,
    email: emailById.get(s.user_id) || null,
    company_name: companyById.get(s.user_id) || null,
  })

  return NextResponse.json({
    payments: (subs ?? []).map(enrich),
    activations: (activations ?? []).map(enrich),
  })
}

// POST — admin action: { subscription_id, action: 'mark_paid' | 'cancel' }
export async function POST(request: Request) {
  const auth = await requireAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => ({}))
  const subscriptionId: string | undefined = body.subscription_id
  const action: string = body.action
  if (!subscriptionId || !['mark_paid', 'cancel'].includes(action)) {
    return NextResponse.json({ error: 'Missing subscription_id or invalid action' }, { status: 400 })
  }

  const adminDb = getAdminClient()
  const { data: sub } = await adminDb
    .from('subscriptions').select('*').eq('id', subscriptionId).single()
  if (!sub) return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })

  if (action === 'cancel') {
    const { error } = await adminDb.from('subscriptions')
      .update({ status: 'canceled' }).eq('id', subscriptionId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, status: 'canceled' })
  }

  // mark_paid — resolve grace months from the coupon (if any).
  let graceMonths = 0
  if (sub.coupon_code) {
    const { data: coupon } = await adminDb
      .from('coupons').select('discount_type, discount_value, times_redeemed').eq('code', sub.coupon_code).maybeSingle()
    if (coupon?.discount_type === 'grace') graceMonths = Number(coupon.discount_value) || 0

    // Increment times_redeemed + record redemption.
    try {
      await adminDb.from('coupons')
        .update({ times_redeemed: (coupon?.times_redeemed ?? 0) + 1 })
        .eq('code', sub.coupon_code)
      await adminDb.from('coupon_redemptions')
        .upsert({ coupon_code: sub.coupon_code, user_id: sub.user_id }, { onConflict: 'coupon_code,user_id' })
    } catch (e: any) {
      console.error('[admin/payments] redemption record failed:', e?.message)
    }
  }

  const periodEnd = addMonths(new Date(), graceMonths || 1)
  const { error } = await adminDb.from('subscriptions').update({
    status: 'active',
    current_period_end: periodEnd.toISOString(),
    confirmed_by: auth.user.id,
    confirmed_at: new Date().toISOString(),
  }).eq('id', subscriptionId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, status: 'active', current_period_end: periodEnd.toISOString() })
}
