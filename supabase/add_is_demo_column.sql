-- Adds companies.is_demo on its own, WITHOUT seeding the demo company.
--
-- The column was previously created only inside seed_demo_company.sql, so any
-- database where that seed wasn't applied had no is_demo column — and code that
-- filtered on it failed with 42703 ("column companies.is_demo does not exist"):
--   • the daily weekly-refresh cron (refreshed no clients at all)
--   • the admin "send report email" button
-- Both now tolerate the missing column, but applying this restores the intended
-- behaviour (demo company excluded from scans / emails) and stops the cron's
-- fallback warning.
--
-- Idempotent and safe on a live table: every existing row gets false, which is
-- correct — no real client is the demo company.
--
-- Apply manually in the Supabase SQL editor.

alter table companies add column if not exists is_demo boolean not null default false;
