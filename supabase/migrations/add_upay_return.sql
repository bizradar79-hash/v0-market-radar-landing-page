-- Upay payment-return metadata on subscriptions.
-- Populated by /api/upay/return when the customer is redirected back from the
-- Upay payment page with success params. Auto-confirmation is PROVISIONAL —
-- browser redirect params can be spoofed, so we keep transaction details for
-- manual reconciliation against the Upay dashboard.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS transaction_id        text,    -- Upay transactionid
  ADD COLUMN IF NOT EXISTS provider_confirmation text,    -- Upay providerconfirmationnumber
  ADD COLUMN IF NOT EXISTS four_digits           text,    -- last 4 card digits
  ADD COLUMN IF NOT EXISTS paid_amount           numeric, -- amount Upay reported
  ADD COLUMN IF NOT EXISTS auto_confirmed        boolean DEFAULT false, -- vs manual confirmed_by
  ADD COLUMN IF NOT EXISTS review_flag           text;    -- e.g. 'amount_mismatch' for manual review

-- Idempotency / reconciliation lookups by transaction.
CREATE INDEX IF NOT EXISTS idx_subscriptions_transaction ON subscriptions (transaction_id);
