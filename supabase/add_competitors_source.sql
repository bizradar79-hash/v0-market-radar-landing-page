-- Run this once in Supabase Dashboard → SQL Editor
-- Adds the 'source' column to differentiate manual vs auto-discovered competitors

ALTER TABLE competitors
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'auto';

-- Mark all existing competitors as auto-discovered (they were all created by AI scan)
UPDATE competitors SET source = 'auto' WHERE source IS NULL;
