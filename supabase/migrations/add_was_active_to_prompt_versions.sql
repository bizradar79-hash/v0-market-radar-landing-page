-- Add was_active column to track versions that were ever pushed to production
ALTER TABLE prompt_versions ADD COLUMN IF NOT EXISTS was_active BOOLEAN DEFAULT false;

-- Backfill: mark currently active versions as was_active
UPDATE prompt_versions SET was_active = true WHERE is_active = true;
