// Subscription gating for the paywall.
//
// PAYWALL_ENFORCED (env, default 'false') controls whether /onboarding and the
// app require an active/grace subscription. We default OFF so existing real
// users are never locked out — flip to 'true' only once everyone is migrated.

export type SubscriptionStatus =
  | 'pending' | 'pending_payment' | 'active' | 'grace' | 'canceled' | 'none'

export interface SubscriptionGate {
  status: SubscriptionStatus
  hasAccess: boolean      // allowed past the paywall (active/grace, or paywall off)
  pendingPayment: boolean // payment submitted, awaiting manual admin confirmation
  enforced: boolean       // whether the paywall is currently enforced
}

export function isPaywallEnforced(): boolean {
  return process.env.PAYWALL_ENFORCED === 'true'
}

/**
 * Resolve the subscription gate for a user.
 * `supabase` may be any client that can read the user's subscription row
 * (the user's own server client works via RLS).
 */
export async function getSubscriptionGate(supabase: any, userId: string): Promise<SubscriptionGate> {
  const enforced = isPaywallEnforced()

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('status')
    .eq('user_id', userId)
    .maybeSingle()

  const status: SubscriptionStatus = (sub?.status as SubscriptionStatus) || 'none'
  const active = status === 'active' || status === 'grace'

  return {
    status,
    // When the paywall is off, everyone has access regardless of status.
    hasAccess: enforced ? active : true,
    pendingPayment: status === 'pending_payment',
    enforced,
  }
}
