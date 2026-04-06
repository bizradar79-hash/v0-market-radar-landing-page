CREATE TABLE IF NOT EXISTS prompt_versions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  module TEXT NOT NULL,
  prompt TEXT NOT NULL,
  model_provider TEXT NOT NULL DEFAULT 'xai',  -- 'xai' | 'gemini' | 'groq'
  model_name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN DEFAULT false,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  test_result JSONB,
  tested_with_company_id TEXT
);

-- Allow service role full access; no RLS needed (admin only table)
ALTER TABLE prompt_versions DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS prompt_versions_module_idx ON prompt_versions (module);
CREATE INDEX IF NOT EXISTS prompt_versions_active_idx ON prompt_versions (module, is_active);
