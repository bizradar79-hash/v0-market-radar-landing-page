-- Run once in Supabase Dashboard → SQL Editor
-- Adds weekly auto-sync tracking columns to the companies table

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS last_sync_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_sync_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_status    TEXT DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS sync_log       JSONB;

-- Back-fill: set next_sync_at = now() for any existing companies so they
-- get picked up by the first cron run within the next hour.
UPDATE companies
SET next_sync_at = NOW()
WHERE next_sync_at IS NULL;
