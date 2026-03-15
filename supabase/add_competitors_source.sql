-- Run this once in Supabase Dashboard → SQL Editor

-- 1. Adds the 'source' column to differentiate manual vs auto-discovered competitors
ALTER TABLE competitors
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'auto';

UPDATE competitors SET source = 'auto' WHERE source IS NULL;

-- 2. Google rating columns (fetched lazily on first modal open)
ALTER TABLE competitors
  ADD COLUMN IF NOT EXISTS google_rating NUMERIC,
  ADD COLUMN IF NOT EXISTS google_review_count INTEGER;
