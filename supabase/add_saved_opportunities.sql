-- Run once in Supabase Dashboard → SQL Editor
-- Creates the saved_opportunities table for the "הזדמנויות שמורות" feature

CREATE TABLE IF NOT EXISTS saved_opportunities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('weekly_action', 'niche', 'market_analysis')),
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'חדש',
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  last_ai_update TIMESTAMPTZ DEFAULT NOW(),
  user_notes TEXT DEFAULT '',
  revenue_potential_score INTEGER DEFAULT 0,
  estimated_revenue_min INTEGER DEFAULT 0,
  estimated_revenue_max INTEGER DEFAULT 0,
  confidence_score INTEGER DEFAULT 0,
  market_region TEXT DEFAULT '',
  industry_tag TEXT DEFAULT '',
  UNIQUE(company_id, source_type, source_id)
);

ALTER TABLE saved_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own saved_opportunities"
  ON saved_opportunities FOR ALL
  USING (company_id = auth.uid());
