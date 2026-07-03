-- Admin-only soft-hide list: lets an admin (in impersonate mode) remove specific
-- items from a client's view WITHOUT the client seeing anything, and have the
-- hide RESPECTED by future scans (hidden item must not reappear).
--
-- Soft, restorable, service-role only. The original item is removed from the
-- live table/blob at hide time (so the client's direct read is instantly clean)
-- but its data is preserved here in `data` for one-click restore, and `item_key`
-- keeps it out of every future scan.
--
-- item_key is a STABLE, NORMALIZED identifier (lib/match/hebrew-core norm()) of
-- the item's title/name/keyword — NOT a row id — because scans delete+reinsert
-- these tables every run, so row ids are not stable but the normalized title is.
--
-- Apply manually in the Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists admin_hidden_items (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  item_type   text not null check (item_type in ('tender','conference','lead','news','competitor','channel','trend')),
  item_key    text not null,            -- normalized (norm()) title/name/keyword — stable across scans
  label       text,                     -- original human-readable label (for the admin list)
  reason      text,                     -- optional admin note
  data        jsonb,                    -- backup of the removed item for one-click restore
  hidden_at   timestamptz not null default now(),
  hidden_by   uuid                      -- admin user id
);

-- One hide per (company, type, key). Re-hiding is idempotent.
create unique index if not exists admin_hidden_items_unique_idx
  on admin_hidden_items (company_id, item_type, item_key);

create index if not exists admin_hidden_items_company_idx
  on admin_hidden_items (company_id, item_type);

-- Service-role only (all reads/writes go through admin routes / service client).
alter table admin_hidden_items enable row level security;
