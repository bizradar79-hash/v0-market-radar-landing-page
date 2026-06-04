-- Scan snapshots: pre-scan state of every module, captured before each scan
-- run. Acts as a safety net / audit log / restore source for data-loss events.

CREATE TABLE IF NOT EXISTS scan_snapshots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  trigger text NOT NULL,              -- 'initial' | 'full' | 'partial'
  created_at timestamptz DEFAULT now(),
  counts jsonb,                       -- {competitors, keyword_trends, seo, geo, industry_trends, tenders, news, conferences}
  data jsonb                          -- full pre-scan state of all modules
);

CREATE INDEX IF NOT EXISTS idx_scan_snapshots_company_created
  ON scan_snapshots (company_id, created_at DESC);

-- RLS: admin-only. Service-role (used by scan orchestrators + admin routes)
-- bypasses RLS, so no permissive policy is needed for them. We enable RLS and
-- add no SELECT/INSERT policy for regular users → effectively admin/service only.
ALTER TABLE scan_snapshots ENABLE ROW LEVEL SECURITY;

-- Allow admins (per user_roles.is_admin) to read snapshots from the dashboard.
DROP POLICY IF EXISTS "admins read snapshots" ON scan_snapshots;
CREATE POLICY "admins read snapshots" ON scan_snapshots
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.is_admin = true
    )
  );
