// Coupon logic for North Star Radar billing.
// ALL validation is SERVER-SIDE ONLY — never trust a client-sent amount.

export const BASE_AMOUNT = 79

export type DiscountType = 'percent' | 'fixed' | 'free' | 'grace'
export type CouponScope = 'first_payment' | 'recurring' | 'forever'

export interface CouponRow {
  code: string
  discount_type: DiscountType
  discount_value: number
  payment_url: string | null
  scope: CouponScope
  active: boolean
  expires_at: string | null
  max_redemptions: number | null
  times_redeemed: number
}

export interface ValidateResult {
  valid: boolean
  reason?: string
  finalAmount: number
  discountType?: DiscountType
  discountValue?: number
  graceMonths: number
  paymentUrl?: string | null
  label?: string
}

/** Normalize a coupon code: trim + uppercase. */
export function normalizeCode(code: string): string {
  return (code || '').trim().toUpperCase()
}

/** Compute the final monthly charge after applying a coupon. */
export function computeFinalAmount(base: number, coupon: Pick<CouponRow, 'discount_type' | 'discount_value'>): number {
  const value = Number(coupon.discount_value) || 0
  switch (coupon.discount_type) {
    case 'percent':
      return Math.round(base * (1 - value / 100) * 100) / 100
    case 'fixed':
      return Math.max(0, base - value)
    case 'free':
      return 0
    case 'grace':
      return 0 // free for `value` months, then resumes at base
    default:
      return base
  }
}

/** Human-readable Hebrew label describing the coupon effect / resulting price. */
export function couponLabel(coupon: Pick<CouponRow, 'discount_type' | 'discount_value'>, finalAmount: number): string {
  const value = Number(coupon.discount_value) || 0
  switch (coupon.discount_type) {
    case 'grace':
      return value === 1 ? 'חודש ראשון חינם' : `${value} חודשים ראשונים חינם`
    case 'free':
      return 'חינם'
    case 'percent':
      return `מחיר לאחר קופון: ${finalAmount} ₪ (${value}% הנחה)`
    case 'fixed':
      return `מחיר לאחר קופון: ${finalAmount} ₪`
    default:
      return `מחיר: ${finalAmount} ₪`
  }
}

/**
 * Validate a coupon for a specific user. SERVER-SIDE ONLY.
 * `supabase` must be a service-role client.
 * Rejects: not found / inactive / expired / max redemptions reached /
 * already redeemed by this user.
 */
export async function validateCoupon(
  supabase: any,
  rawCode: string,
  userId: string,
  base: number = BASE_AMOUNT,
): Promise<ValidateResult> {
  const code = normalizeCode(rawCode)
  const fail = (reason: string): ValidateResult => ({
    valid: false, reason, finalAmount: base, graceMonths: 0,
  })

  if (!code) return fail('missing_code')

  const { data: coupon } = await supabase
    .from('coupons').select('*').eq('code', code).maybeSingle()

  if (!coupon) return fail('not_found')
  if (!coupon.active) return fail('inactive')
  if (coupon.expires_at && new Date(coupon.expires_at).getTime() < Date.now()) return fail('expired')
  if (coupon.max_redemptions != null && (coupon.times_redeemed ?? 0) >= coupon.max_redemptions) {
    return fail('max_redemptions')
  }

  // Already redeemed by this user?
  const { data: prior } = await supabase
    .from('coupon_redemptions')
    .select('coupon_code')
    .eq('coupon_code', code)
    .eq('user_id', userId)
    .maybeSingle()
  if (prior) return fail('already_redeemed')

  const finalAmount = computeFinalAmount(base, coupon)
  const graceMonths = coupon.discount_type === 'grace' ? (Number(coupon.discount_value) || 0) : 0

  return {
    valid: true,
    finalAmount,
    discountType: coupon.discount_type,
    discountValue: Number(coupon.discount_value) || 0,
    graceMonths,
    paymentUrl: coupon.payment_url ?? null,
    label: couponLabel(coupon, finalAmount),
  }
}
