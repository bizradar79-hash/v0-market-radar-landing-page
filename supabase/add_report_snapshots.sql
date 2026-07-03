-- Per-scan ARCHIVE snapshots of the client web report. Each completed scan (and
-- each admin "צור דוח עדכני") freezes the FULL assembled report data as jsonb,
-- viewable at a stable URL /r/a/<snapshot_token>. Apply once in the Supabase SQL
-- editor (same as the other add_*.sql files).

create extension if not exists pgcrypto;

create table if not exists report_snapshots (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  snapshot_token text not null default encode(gen_random_bytes(24), 'hex'),
  label         text,                 -- e.g. the scan date, shown in the archive badge
  data          jsonb not null,       -- the full assembled ReportData
  created_at    timestamptz not null default now()
);

-- Unique unguessable token for the public archive URL.
create unique index if not exists report_snapshots_token_idx on report_snapshots(snapshot_token);
-- Fast "latest snapshots per company" listing.
create index if not exists report_snapshots_company_idx on report_snapshots(company_id, created_at desc);

-- Service-role only (public archive route reads via service role, like /r).
alter table report_snapshots enable row level security;
