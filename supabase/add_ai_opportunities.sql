-- Run once in Supabase Dashboard → SQL Editor
-- Creates the ai_opportunities table for the "מרכז הזדמנויות" feature

CREATE TABLE IF NOT EXISTS ai_opportunities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN ('weekly', 'niche', 'market_analysis')),
  revenue_potential_score INTEGER DEFAULT 0,
  estimated_revenue_min INTEGER DEFAULT 0,
  estimated_revenue_max INTEGER DEFAULT 0,
  market_demand_score INTEGER DEFAULT 0,
  competition_score INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'חדש' CHECK (status IN ('חדש', 'בבדיקה', 'בפעולה', 'נסגר')),
  notes TEXT DEFAULT '',
  previous_revenue_score INTEGER DEFAULT 0,
  score_change INTEGER DEFAULT 0,
  heat_status TEXT DEFAULT NULL CHECK (heat_status IN ('heating', 'cooling', NULL)),
  last_ai_update TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ai_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own ai_opportunities"
  ON ai_opportunities FOR ALL
  USING (company_id = auth.uid());
