-- Billing: coupons + subscriptions + redemptions.
-- Provider: Upay via STATIC payment-page links only (no API). Payment is
-- confirmed MANUALLY by an admin — reaching /onboarding is NOT proof of payment.

-- ── coupons ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coupons (
  code            text PRIMARY KEY,                 -- admin-chosen, normalized UPPERCASE, unique
  discount_type   text NOT NULL,                    -- 'percent' | 'fixed' | 'free' | 'grace'
  discount_value  numeric NOT NULL DEFAULT 0,       -- percent:0-100 | fixed:₪ off | free:ignored | grace:free MONTHS
  payment_url     text,                             -- pre-built Upay link for THIS coupon's price (required percent/fixed)
  scope           text NOT NULL DEFAULT 'first_payment', -- 'first_payment' | 'recurring' | 'forever'
  active          boolean DEFAULT true,
  expires_at      timestamptz,
  max_redemptions int,                              -- null = unlimited
  times_redeemed  int DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

-- ── subscriptions ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  status             text NOT NULL DEFAULT 'pending', -- pending | pending_payment | active | grace | canceled
  base_amount        numeric DEFAULT 79,
  final_amount       numeric,
  coupon_code        text,
  provider           text DEFAULT 'upay',
  payment_token      text,                          -- reserved for future redirect-token (unused now)
  current_period_end timestamptz,
  confirmed_by       uuid,
  confirmed_at       timestamptz,
  created_at         timestamptz DEFAULT now()
);

-- One subscription row per user (upserted by checkout).
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_user_id_key ON subscriptions (user_id);

-- ── coupon_redemptions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coupon_redemptions (
  coupon_code text,
  user_id     uuid,
  redeemed_at timestamptz DEFAULT now(),
  UNIQUE (coupon_code, user_id)                     -- one use per user
);

-- ── RLS ────────────────────────────────────────────────────────────────────
-- coupons: admin-write only; no public read (validation happens server-side
-- with the service-role client). Service-role bypasses RLS.
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins manage coupons" ON coupons;
CREATE POLICY "admins manage coupons" ON coupons
  FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.is_admin = true));

-- subscriptions: a user may READ their own row; only admins/service may write.
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read own subscription" ON subscriptions;
CREATE POLICY "users read own subscription" ON subscriptions
  FOR SELECT
  USING (user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.is_admin = true));
DROP POLICY IF EXISTS "admins write subscriptions" ON subscriptions;
CREATE POLICY "admins write subscriptions" ON subscriptions
  FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.is_admin = true));

-- coupon_redemptions: admin/service only (no permissive policy for users).
ALTER TABLE coupon_redemptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read redemptions" ON coupon_redemptions;
CREATE POLICY "admins read redemptions" ON coupon_redemptions
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.is_admin = true));

-- ── indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions (status);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon ON coupon_redemptions (coupon_code);
