-- COMPETITOR TRACKING — the client-facing competitor module (replaces the old
-- auto-discovery `competitors` engine, which stays in place but disabled).
--
-- ONE ROW PER COMPETITOR PER COMPANY, updated in place each scan: this is the
-- CURRENT picture, not a history log. (The admin dev sandbox,
-- competitor_intel_dev, keeps per-run history for calibration.)
--
-- Apply manually in the Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists competitor_tracking (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  -- Matches a name from companies.business_profile.directCompetitors (the
  -- single source of truth for WHO gets tracked).
  competitor_name text not null,

  -- Cached discovery: { website, instagram, facebook, linkedin, cid, mapsUrl,
  -- resolvedAt }. Cached ON PURPOSE — re-running AI link discovery every scan
  -- costs a model call per competitor and can regress a good link. Re-resolved
  -- only when empty or when an admin forces the module.
  resolved_links  jsonb not null default '{}'::jsonb,

  -- Raw per-source scrape results: [{ source, status, url, posts, profile,
  -- postsTotal, postsRecent, error }]
  sources         jsonb not null default '[]'::jsonb,

  -- Deterministic insights (NO LLM): cadence, themes, topPosts, presence,
  -- followers, windowDays.
  insights        jsonb,

  -- Google reviews snapshot + review insights (rating, count, recent reviews,
  -- new-in-window, sentiment vs average, themes, negatives).
  reviews         jsonb,

  -- Per-competitor cost of the last run (BrightData records + DataForSEO calls).
  cost            jsonb,

  scanned_at      timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

-- One row per (company, competitor) — the scan upserts on this key.
create unique index if not exists competitor_tracking_unique
  on competitor_tracking (company_id, competitor_name);

create index if not exists competitor_tracking_company_idx
  on competitor_tracking (company_id, scanned_at desc);

-- Clients read their own rows; writes go through the service role.
alter table competitor_tracking enable row level security;

drop policy if exists "own competitor tracking" on competitor_tracking;
create policy "own competitor tracking" on competitor_tracking
  for select using (auth.uid() = company_id);

-- ── Added later: website change detection ──────────────────────────────────
-- The cleaned text of the competitor's site, kept so the NEXT run can compare
-- against it. `website_snapshot` is the current version, `website_snapshot_prev`
-- the one before it (handy for re-diffing or auditing a reported change).
--
-- The comparison itself is deterministic (normalized hash / similarity) and a
-- model is called ONLY when the text actually moved — so a static competitor
-- site costs nothing on every subsequent scan.
alter table competitor_tracking add column if not exists website_snapshot      text;
alter table competitor_tracking add column if not exists website_snapshot_prev text;
alter table competitor_tracking add column if not exists website_snapshot_at   timestamptz;
-- { status, changes:[{kind,text,soWhat}], similarity, checkedAt, note, error }
alter table competitor_tracking add column if not exists website              jsonb;
