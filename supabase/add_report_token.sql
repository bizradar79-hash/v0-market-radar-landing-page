-- Permanent, unguessable per-company token for the public web report at /r/<token>.
-- Apply once in the Supabase SQL editor (same as the other add_*.sql files).

create extension if not exists pgcrypto;

-- 1. Column (48 hex chars = 24 random bytes).
alter table companies add column if not exists report_token text;

-- 2. Backfill every existing company that doesn't have one yet.
update companies
  set report_token = encode(gen_random_bytes(24), 'hex')
  where report_token is null;

-- 3. New companies auto-get a token at INSERT (no app code needed).
alter table companies
  alter column report_token set default encode(gen_random_bytes(24), 'hex');

-- 4. Fast, unique lookup by token.
create unique index if not exists companies_report_token_idx on companies(report_token);
