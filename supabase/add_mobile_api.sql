-- Mobile API support (feature/mobile-api). Apply once in the Supabase SQL editor.
-- Both tables are service-role only: RLS on, no policies → anon/auth clients
-- can't read or write them; the mobile routes use the service role server-side.

-- 1. Shared rate-limit store. Vercel functions are isolated, so an in-memory
--    counter would reset per instance; this table is the shared counter.
create table if not exists mobile_rate_limits (
  key          text primary key,          -- e.g. 'login:email:a@b.com', 'api:<user-id>'
  count        integer not null default 0,
  window_start timestamptz not null default now()
);
alter table mobile_rate_limits enable row level security;

-- Atomic "hit": starts a new window when the old one expired, else increments.
-- Returns the count in the current window and when the window resets.
create or replace function mobile_rate_hit(p_key text, p_window_seconds integer)
returns table (hits integer, reset_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  return query
  insert into mobile_rate_limits as r (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update
    set count = case when r.window_start < now() - make_interval(secs => p_window_seconds)
                     then 1 else r.count + 1 end,
        window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds)
                            then now() else r.window_start end
  returning r.count, r.window_start + make_interval(secs => p_window_seconds);
end $$;
revoke all on function mobile_rate_hit(text, integer) from public, anon, authenticated;

-- 2. Per-company read state for feed items (item_key = '<type>:<row id>').
create table if not exists mobile_feed_reads (
  company_id uuid not null references companies(id) on delete cascade,
  item_key   text not null,
  read_at    timestamptz not null default now(),
  primary key (company_id, item_key)
);
alter table mobile_feed_reads enable row level security;
