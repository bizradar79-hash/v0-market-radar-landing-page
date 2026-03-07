-- AI Usage tracking table
create table if not exists ai_usage (
  id bigserial primary key,
  provider text not null,
  tokens integer not null default 0,
  created_at timestamptz not null default now()
);

-- Index for fast 24h queries
create index if not exists ai_usage_created_at_idx on ai_usage (created_at desc);

-- Disable RLS (service role reads/writes only)
alter table ai_usage disable row level security;
