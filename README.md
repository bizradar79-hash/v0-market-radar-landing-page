# Market Radar Israel AI

**Israeli Market Intelligence SaaS** — an AI-powered dashboard that gives Israeli businesses real-time competitive intelligence: competitor tracking, market trends, tenders, leads, news, and AI ranking analysis.

**Production:** https://v0-market-radar-landing-page.vercel.app
**GitHub:** https://github.com/bizradar79-hash/v0-market-radar-landing-page

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.1.6 (App Router, Turbopack) |
| Language | TypeScript 5.7.3 |
| UI | React 19, Tailwind CSS v4, Radix UI (shadcn/ui), Lucide Icons |
| Database | Supabase (PostgreSQL + Auth + Row Level Security) |
| Auth | Supabase SSR (`@supabase/ssr`) + `middleware.ts` for token refresh |
| Primary AI | Groq — `llama-3.3-70b-versatile` → fallback `llama-3.1-8b-instant` |
| Fallback AI | Google Gemini — `gemini-2.0-flash` |
| Search AI | xAI Grok — `grok-4-fast-non-reasoning` with `web_search` tool |
| Web Search | Tavily (primary) → Serper fallback (auto-switch on error/empty) |
| Charts | Recharts |
| Forms | React Hook Form + Zod |
| Deployment | Vercel (auto-deploy from GitHub `main`) |
| Analytics | Vercel Analytics |

---

## Architecture Overview

```
User Browser
    │
    ▼
Next.js App Router (app/)
    ├── app/                  ← landing / marketing pages
    ├── app/app/              ← authenticated dashboard (all modules)
    ├── app/api/              ← server-side API routes (AI, DB)
    ├── app/onboarding/       ← first-run company setup wizard
    ├── app/login/            ← auth pages
    └── app/impersonate-callback/  ← admin impersonation handler

lib/
    ├── context.ts            ← getFullContext(): shared company data loader
    ├── ai.ts                 ← analyzeWithAI() — Groq→Gemini fallback chain
    ├── search.ts             ← search() — Tavily→Serper fallback
    ├── scrape.ts             ← scrapeWebsite() — plain fetch, 5000 char limit
    ├── dedup.ts              ← deduplicateByField, extractDomain
    ├── usage.ts              ← trackUsage() — logs AI/search calls to DB
    └── analyze-business.ts   ← analyzeBusinessForSearch() — Step 1 Grok reasoning
```

### Core Pattern: `getFullContext()`

Every AI route begins with `getFullContext()` which:
1. Authenticates via cookie session or `Authorization: Bearer` header
2. Loads the company profile from Supabase (`companies` table)
3. Loads saved competitors from the `competitors` table
4. Scrapes the company website (up to 5,000 chars)
5. Returns: `{ company, competitors, user, supabase, context, companyDomain, companyProfile }`

No Tavily/Serper calls happen in `getFullContext()` — each route does its own targeted searches to avoid timeout.

### AI Fallback Chain

```
analyzeWithAI()
    └── Groq llama-3.3-70b-versatile
            └── [on failure] Groq llama-3.1-8b-instant
                    └── [on failure] Gemini gemini-2.0-flash
```

### xAI Grok — Search-Enabled Queries

For routes that need real-time web data, the xAI Responses API is used directly:

```
POST https://api.x.ai/v1/responses
body: {
  model: "grok-4-fast-non-reasoning",
  input: [{ role: "user", content: prompt }],
  tools: [{ type: "web_search" }]   ← Grok searches the web internally
}
```

Text is extracted from `output[].content[type=output_text].text`. Grok handles its own search internally — no separate Tavily/Serper call needed for these routes.

---

## Modules

### 1. Dashboard (`/app/dashboard`)
Overview widgets: total competitors, leads, tenders, active trends. Quick-access buttons to regenerate any module.

---

### 2. Competitors (`/app/competitors`)

**Discovery** via `/api/find-competitors`:
- 2-step Grok prompt: (1) identify the business's specific niche, (2) search for exact-match competitors
- Max 8 results, deduplicated by domain
- Filtered against user blacklist and retail blocklist

**Threat Score:** `base 0–70 (from Grok)` + Google Rating bonus (+20/+15/+10) + Review Count bonus (+10/+5) = max 100

**Google Rating:** Fetched lazily on first modal open via `/api/fetch-competitor-rating`

**Blacklist:** Deleted competitors saved to `companies.competitors_blacklist` and excluded from future scans

**SEO Ranking** — Real search data:
- Step 1: Grok (no web_search) analyzes `business_overview` → extracts optimal `google_query`
- Step 2: Grok (web_search) searches Google and returns top 10 organic results
- Local vs National scope detection uses `companies.geographic_area`:
  - Local (`geographic_area.length ≤ 2`, not `כל הארץ`) → `"[niche] [city]"` + Local Pack note
  - National → `"[niche] ישראל"`
- Scope badge shown in UI: `"חיפוש מקומי — תל אביב"` / `"חיפוש ארצי"`
- Results saved to `companies.seo_ranking` JSONB

**GEO Ranking** — AI knowledge test (no web_search):
- Step 1: Same business analysis → extracts natural `ai_question`
- Step 2: Grok answers from internal knowledge only (simulates ChatGPT/Gemini/Perplexity)
- Tests whether the business appears when AI engines are asked about its category
- Results saved to `companies.geo_ranking` JSONB

Both ranking cards show: `"AI הבין: [what_business_does]"` so the user can verify the AI understood the business correctly.

---

### 3. Trends (`/app/trends`)

Keyword trends section always appears first.

**Keyword Trends** (user-defined):
- Users add up to 10 keywords (saved to `companies.keywords`)
- Per-keyword: Grok web_search finds what was trending in Israel in the past week
- Returns 5 trending phrases per keyword with direction, reason, and 4 weekly data points (W1–W4, value 0–100)
- SVG sparkline mini-chart rendered inline per phrase (green/red/gray by direction)
- Data persisted to `companies.keyword_trends` JSONB — survives page navigation
- Only re-fetched when user clicks רענן or adds a new keyword

**General Trends** (AI-generated):
- Grok searches for market trends relevant to the business sector
- Grouped by source/category
- Direction badges: עולה / יורד / יציב

---

### 4. News (`/app/news`)
- Grok searches for 10 relevant news items
- **Time window:** Last 30 days — actual cutoff date embedded in prompt (`"דחה כל חדשה שפורסמה לפני YYYY-MM-DD"`)
- **Code filters after parse:** `date ≥ cutoff` AND `relevance_score ≥ 80`
- Automatic retry with 60-day window if fewer than 5 items pass filters
- Displayed in two sections: **ישראל** first, **עולם** second
- Stored in `news` table, `category` field = `ישראל` / `עולם`

---

### 5. Tenders (`/app/tenders`)
- Searches gov.il domains for open government tenders
- URL validation: must be `.gov.il` / `.org.il` / `.co.il` / `.ac.il` / `.muni.il`, not a PDF/doc, not a bare homepage
- Date validation: rejects missing or invalid deadlines
- Junk title filter: removes generic/garbage results
- Stored in `tenders` table

---

### 6. Leads (`/app/leads`)
- AI-generated potential business leads scored 0–100 by relevance
- Stored in `leads` table with source, industry, location fields

---

### 7. Conferences (`/app/conferences`)
- Upcoming Israeli industry conferences and events relevant to the business sector
- Stored in `conferences` table

---

### 8. Alerts (`/app/alerts`)
Alert feed for significant market changes detected across all modules.

---

### 9. Reports (`/app/reports`)
Aggregated intelligence reports combining data from all modules.

---

### 10. Settings & Profile (`/app/settings`, `/app/profile`)
Company profile editing: name, industry, city, website, description, keywords, geographic area, target customers.

---

## Database Schema (Supabase / PostgreSQL)

### `companies` — one row per user
| Column | Type | Notes |
|---|---|---|
| id | UUID | equals Supabase `auth.users.id` |
| name | TEXT | |
| industry | TEXT | |
| city | TEXT | |
| website | TEXT | |
| description | TEXT | |
| business_overview | TEXT | Rich description used in AI prompts |
| keywords | TEXT[] | Up to 10 user-defined keywords |
| geographic_area | TEXT[] | e.g. `["תל אביב"]` or `["כל הארץ"]` |
| target_customers | TEXT[] | |
| keyword_trends | JSONB | `{ "keyword": { fetchedAt, trends[] } }` |
| seo_ranking | JSONB | Latest SEO ranking result |
| geo_ranking | JSONB | Latest GEO ranking result |
| competitors_blacklist | TEXT[] | Names excluded from auto-scan |

### `competitors`
`id, company_id, name, website, services, pricing, positioning, last_activity, threat_score, trend, source (auto/manual), google_rating, google_review_count, created_at`

### `leads`
`id, company_id, name, website, industry, location, reason, score, source, created_at`

### `tenders`
`id, company_id, title, organization, deadline, budget, description, link, relevance_score, created_at`

### `conferences`
`id, company_id, name, date, location, description, url, category, created_at`

### `trends`
`id, company_id, name, category, direction, description, created_at`

### `news`
`id, company_id, title, source, url, category (ישראל/עולם), sentiment, summary, published_at, created_at`

### `opportunities`
`id, company_id, title, description, impact_score, confidence_score, priority, type, actions[], sources[], created_at`

### `ai_usage`
`id, provider, tokens, created_at` — tracks every AI/search call (service role, no RLS)

---

## API Routes

| Route | Method | Description |
|---|---|---|
| `/api/find-competitors` | POST | Discover competitors via 2-step Grok web_search |
| `/api/fetch-competitor-rating` | POST | Lazy-fetch Google rating for one competitor |
| `/api/generate-seo-ranking` | POST | 2-step SEO ranking: business analysis → Google search |
| `/api/generate-geo-ranking` | POST | 2-step GEO ranking: business analysis → AI knowledge test |
| `/api/generate-trends` | POST | Market trends for the business sector |
| `/api/generate-keyword-trends` | POST | Trending phrases for a single keyword |
| `/api/generate-news` | POST | 30-day relevant news (Israeli + international) |
| `/api/generate-tenders` | POST | Open government tenders from gov.il |
| `/api/generate-leads` | POST | Potential leads for the business |
| `/api/generate-conferences` | POST | Upcoming industry conferences |
| `/api/admin/generate-magic-link` | POST | Admin: generate impersonation link for a user |
| `/api/health-check` | GET | Lightweight liveness check |
| `/api/usage-stats` | GET | AI/search token usage for last 24h |
| `/api/test-ai` | GET | Tests Groq and Gemini connectivity |
| `/api/get-test-token` | GET | Returns Bearer token for test user (dev only) |

---

## Authentication & Admin

**User auth:** Supabase email/password. `middleware.ts` runs on every request to refresh expired access tokens — without it sessions expire silently after 1 hour.

**Admin impersonation flow:**
1. Admin logs in at `/admin-login` (checks `user_roles.is_admin`)
2. Selects a user at `/app/admin/impersonate`
3. Backend generates a Supabase magic link with `redirect_to=/impersonate-callback`
4. `/impersonate-callback` (client component) reads `#access_token` and `#refresh_token` from URL hash, calls `supabase.auth.setSession()`, redirects to `/app/dashboard`

---

## Key Engineering Rules

| Rule | Why |
|---|---|
| `cookies()` is async in Next.js 16 | Must `await cookies()` — sync call silently returns empty |
| No module-level AI/search clients | Lazy init inside functions prevents cold-start errors |
| Never spread AI output into Supabase insert | Extra keys cause PostgREST 400 — always map explicitly |
| Never tell Grok to self-filter (`"only score ≥ 80"`) | Returns empty array — filter in code after parse |
| `maxDuration = 60` on all heavy routes | Vercel function timeout |
| `export const dynamic = 'force-dynamic'` on all dashboard pages | Disables static generation for auth-gated pages |
| `middleware.ts` is required | Without it: `"Auth session missing!"` after 1 hour |

---

## Environment Variables

| Variable | Used for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (client-side safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin operations (server only) |
| `XAI_API_KEY` | Grok / xAI Responses API |
| `GROQ_API_KEY` | Groq LLM API |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini fallback |
| `TAVILY_API_KEY` | Tavily web search |
| `SERPER_API_KEY` | Serper web search (Tavily fallback) |

---

## Local Development

```bash
npm install

# .env.local needs at minimum:
# NEXT_PUBLIC_SUPABASE_URL=your_url
# NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key
# (other keys can be placeholder strings for local build)

npm run dev     # http://localhost:3000 with Turbopack hot reload
npm run build   # TypeScript errors are non-blocking in build
```

**Test user:** `test@marketradar.co.il` / `Test123456!`

---

## Deployment

Push to `main` → Vercel auto-deploys. All env vars are configured in the Vercel dashboard.

### One-time DB Migration
Run once in **Supabase Dashboard → SQL Editor** (`supabase/add_jsonb_columns.sql`):

```sql
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS keyword_trends        JSONB,
  ADD COLUMN IF NOT EXISTS seo_ranking           JSONB,
  ADD COLUMN IF NOT EXISTS geo_ranking           JSONB,
  ADD COLUMN IF NOT EXISTS competitors_blacklist TEXT[] DEFAULT '{}';
```
