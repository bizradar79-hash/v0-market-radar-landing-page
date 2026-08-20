-- Isolated storage for the ADMIN competitor-intel DEV sandbox (BrightData).
-- Completely separate from the live `competitors` / `competitor_trends` data —
-- nothing here feeds client scans or the client report. Safe to truncate.
--
-- Apply manually in the Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists competitor_intel_dev (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  competitor_name text not null,
  -- Raw per-source scrape results + status:
  -- [{ source, status, url, text, error }]  (website|instagram|facebook|linkedin|tiktok)
  sources         jsonb not null default '[]'::jsonb,
  -- LLM briefing: { summary, items:[{what,source,date,kind,implication}], sourcesUsed, sourcesEmpty, generatedAt }
  briefing        jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists competitor_intel_dev_company_idx
  on competitor_intel_dev (company_id, created_at desc);

-- Service-role only (all access goes through admin routes).
alter table competitor_intel_dev enable row level security;

-- ── Added later: per-run cost breakdown ────────────────────────────────────
-- { brightdata:{requests,scrapes,searches,perRequestUSD,costUSD,precision},
--   llm:{model,promptTokens,completionTokens,costUSD,precision}, totalUSD }
-- BrightData figures are EXACT (counted from the requests we fire); the model
-- figures are exact when the provider returns token counts, else estimated.
alter table competitor_intel_dev add column if not exists cost jsonb;

-- ── Added later: Google reviews snapshot (DataForSEO) ──────────────────────
-- { found, title, address, cid, rating, reviewsCount, reviews:[{date,rating,text,author}],
--   insights:{ standing, recent, sentiment, themes, negatives, windowDays },
--   capturedAt, costUSD, error }
-- Stored per RUN (never overwritten), so rating + reviewsCount across runs form
-- a growth series — the review-side equivalent of the follower counts.
alter table competitor_intel_dev add column if not exists reviews jsonb;
