-- BLOG — public SEO articles at /blog, managed from the admin "בלוג" section.
--
-- Apply manually in the Supabase SQL editor. Idempotent — safe to re-run.

create extension if not exists pgcrypto;

create table if not exists blog_posts (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  -- The URL segment: /blog/<slug>. Unique, lowercase, Hebrew letters allowed.
  slug             text not null,
  -- Rich HTML from the admin editor. SANITIZED on save (lib/blog/sanitize.ts)
  -- and again on render — never trusted as-is.
  content          text not null default '',
  excerpt          text,
  cover_image_url  text,
  -- <meta name="description">. Falls back to the excerpt when empty.
  meta_description text,
  published        boolean not null default false,
  published_at     timestamptz,
  -- Manual position. NULL = ordered by date. When set, it overrides the date
  -- order (ascending: 1 is first). The admin can reset all to NULL.
  sort_order       integer,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists blog_posts_slug_key on blog_posts (slug);

-- The public list query: manual order first, then newest.
create index if not exists blog_posts_public_order_idx
  on blog_posts (published, sort_order nulls last, published_at desc);

create or replace function blog_posts_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists blog_posts_touch_updated_at on blog_posts;
create trigger blog_posts_touch_updated_at
  before update on blog_posts
  for each row execute function blog_posts_touch_updated_at();

-- ── Access ─────────────────────────────────────────────────────────────────
-- Anyone may READ a published post whose date has arrived (that's what lets the
-- public pages render and Google index them). All WRITES go through the admin
-- API with the service role, which bypasses RLS — so there are no write
-- policies, and an ordinary signed-in client cannot create or edit posts.
alter table blog_posts enable row level security;

drop policy if exists "public reads published posts" on blog_posts;
create policy "public reads published posts" on blog_posts
  for select
  using (published = true and (published_at is null or published_at <= now()));

-- ── Images ─────────────────────────────────────────────────────────────────
-- Public bucket for cover images and in-article images. Uploads happen only
-- through /api/admin/blog/upload (service role); reads are public URLs.
insert into storage.buckets (id, name, public)
values ('blog', 'blog', true)
on conflict (id) do update set public = true;
