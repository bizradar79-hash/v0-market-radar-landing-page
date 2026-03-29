-- Run once in Supabase Dashboard → SQL Editor
-- Adds all JSONB columns that are used by the app but may be missing from the companies table
-- Safe to run multiple times (IF NOT EXISTS)

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS business_profile       JSONB,
  ADD COLUMN IF NOT EXISTS review_analysis        JSONB,
  ADD COLUMN IF NOT EXISTS trends_analysis        JSONB,
  ADD COLUMN IF NOT EXISTS distribution_channels  JSONB,
  ADD COLUMN IF NOT EXISTS industry_trends        JSONB,
  ADD COLUMN IF NOT EXISTS competitor_trends      JSONB;

-- Add news company_id FK if missing (news table uses company_id for per-user isolation)
ALTER TABLE news
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- Ensure RLS policy exists on news table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'news' AND policyname = 'Users manage their own news'
  ) THEN
    ALTER TABLE news ENABLE ROW LEVEL SECURITY;
    EXECUTE $policy$
      CREATE POLICY "Users manage their own news"
        ON news FOR ALL
        USING (company_id = auth.uid())
    $policy$;
  END IF;
END
$$;
