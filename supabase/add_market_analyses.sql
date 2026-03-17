-- Run once in Supabase Dashboard → SQL Editor
-- Creates the market_analyses table for the Market Analysis (ניתוח שוק) feature

CREATE TABLE IF NOT EXISTS market_analyses (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  query      TEXT NOT NULL,
  region     TEXT,
  category   TEXT,
  result     JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE market_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own analyses"
  ON market_analyses FOR ALL
  USING (company_id = auth.uid());
