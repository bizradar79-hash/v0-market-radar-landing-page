// Payment provider abstraction. We currently use STATIC Upay payment-page
// links only (no Upay API). Each paid coupon carries its own pre-built link;
// the no-coupon full-price flow uses UPAY_STATIC_PAYMENT_URL.

export const UPAY_STATIC_PAYMENT_URL =
  process.env.UPAY_STATIC_PAYMENT_URL
  || 'https://app.upay.co.il/API6/s.php?m=VnF2bWZPcXVpdTh0ZFpIWENuL1YvUT09'

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

    // Paid, no coupon → full-price static link.
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
