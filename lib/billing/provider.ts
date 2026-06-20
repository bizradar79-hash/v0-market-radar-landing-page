// Payment provider abstraction. We currently use STATIC Upay payment-page
// links only (no Upay API). The amount is BAKED INTO each Upay link token
// (s.php?m=...) on Upay's side — it is NOT a query param we can set. So every
// price needs its own pre-built link: each paid coupon carries its own link,
// and the no-coupon FULL-PRICE (₪79) flow uses UPAY_STATIC_PAYMENT_URL.
//
// PRODUCTION BUG FIX: there used to be a hardcoded fallback link here. When
// UPAY_STATIC_PAYMENT_URL was unset in prod, the no-coupon flow silently used
// that fallback — a ₪0 page — so full-price customers were charged ₪0. There is
// now NO fallback: this MUST be set to the real ₪79 Upay payment-page link
// (built in the Upay dashboard exactly like a coupon link). If it's empty we
// FAIL LOUDLY (see createCheckout) rather than send a customer to a ₪0 page.
export const UPAY_STATIC_PAYMENT_URL = process.env.UPAY_STATIC_PAYMENT_URL || ''

export interface CheckoutArgs {
  userId: string
  coupon: { discount_type: string; payment_url: string | null } | null
  finalAmount: number
  graceMonths: number
}

export interface CheckoutResult {
  mode: 'redirect' | 'activated'
  url?: string
}

export interface PaymentProvider {
  createCheckout(args: CheckoutArgs): Promise<CheckoutResult>
}

/**
 * Static-link provider — USE NOW.
 *  - finalAmount === 0 (free/grace)         -> { mode:'activated' }   (no Upay)
 *  - coupon with payment_url (percent/fixed) -> { mode:'redirect', url: coupon.payment_url }
 *  - no coupon (full 79₪)                    -> { mode:'redirect', url: UPAY_STATIC_PAYMENT_URL }
 *  - paid coupon MISSING payment_url         -> throw 'coupon_misconfigured'
 */
export const staticLinkProvider: PaymentProvider = {
  async createCheckout({ coupon, finalAmount }: CheckoutArgs): Promise<CheckoutResult> {
    // Free / grace — nothing to charge, activate directly.
    if (finalAmount === 0) {
      return { mode: 'activated' }
    }

    // Paid with a coupon: must carry its own pre-built link.
    if (coupon) {
      if (!coupon.payment_url) {
        throw new Error('coupon_misconfigured')
      }
      return { mode: 'redirect', url: coupon.payment_url }
    }

    // Paid, no coupon → full-price (₪79) static link. Must be configured to a
    // real ₪79 Upay page. NEVER fall back to a default — a wrong link silently
    // charges ₪0. Fail loud so checkout surfaces an error instead.
    if (!UPAY_STATIC_PAYMENT_URL) {
      throw new Error('upay_base_url_missing')
    }
    return { mode: 'redirect', url: UPAY_STATIC_PAYMENT_URL }
  },
}

/** Upay API provider — STUB. Awaiting Upay API documentation. */
export const upayApiProvider: PaymentProvider = {
  async createCheckout(): Promise<CheckoutResult> {
    throw new Error('NotImplemented: awaiting Upay API doc')
  },
}

/** The active provider used by the checkout route. */
export const paymentProvider: PaymentProvider = staticLinkProvider
