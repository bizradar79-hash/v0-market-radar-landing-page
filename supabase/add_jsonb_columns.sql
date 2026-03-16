-- Run once in Supabase Dashboard → SQL Editor
-- Adds JSONB columns for AI-generated data and other new fields

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS keyword_trends  JSONB,
  ADD COLUMN IF NOT EXISTS seo_ranking     JSONB,
  ADD COLUMN IF NOT EXISTS geo_ranking     JSONB,
  ADD COLUMN IF NOT EXISTS competitors_blacklist TEXT[] DEFAULT '{}';
