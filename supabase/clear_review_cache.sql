-- Run once in Supabase Dashboard → SQL Editor
-- Clears cached review_analysis for all companies so the next sync
-- fetches fresh data with the updated Google Places pipeline.
UPDATE companies SET review_analysis = NULL;
