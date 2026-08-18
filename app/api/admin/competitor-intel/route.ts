export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import {
  scrapeUrl, scrapeSocialProfile, postsToText, discoverProfileUrl, isBrightDataConfigured,
  RequestCounter, BRIGHTDATA_COST_PER_REQ, BRIGHTDATA_RECORD_COST, type SocialPlatform,
} from '@/lib/brightdata/client'
import { summarizeCompetitor, INTEL_SOURCES, type IntelSource, type SourceResult } from '@/lib/competitor-intel/summarize'

function adminDb() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

async function requireAdmin(): Promise<NextResponse | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: role } = await supabase
    .from('user_roles').select('is_admin').eq('user_id', user.id).single()
  if (!role?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}

// Host fragment used to auto-discover a profile URL when the admin left it blank.
// Keep the last N runs per company so we can compare without re-scraping.
const RUN_HISTORY_CAP = Number(process.env.COMPETITOR_INTEL_RUN_CAP) || 6

const DISCOVER_HOST: Partial<Record<IntelSource, string>> = {
  website: '', // never guessed — an unknown site is too risky to invent
  instagram: 'instagram.com',
  facebook: 'facebook.com',
  linkedin: 'linkedin.com/company',
}

// GET ?company_id= → recent dev runs for that company
export async function GET(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  const companyId = new URL(request.url).searchParams.get('company_id')
  if (!companyId) return NextResponse.json({ error: 'Missing company_id' }, { status: 400 })

  const { data, error } = await adminDb()
    .from('competitor_intel_dev')
    .select('id, competitor_name, sources, briefing, cost, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(RUN_HISTORY_CAP)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, runs: data || [], brightdata: isBrightDataConfigured() })
}

// POST { company_id, competitor: { name, urls: {website,instagram,...} } }
// Scrapes every provided/discovered source INDEPENDENTLY, then summarizes.
export async function POST(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied

  const body = await request.json().catch(() => ({}))
  const companyId: string = body.company_id
  const competitor = body.competitor || {}
  const name: string = (competitor.name || '').trim()
  if (!companyId || !name) {
    return NextResponse.json({ error: 'Missing company_id or competitor.name' }, { status: 400 })
  }

  const db = adminDb()
  const { data: company } = await db
    .from('companies').select('name, website, industry, description, business_profile').eq('id', companyId).single()

  const bp: any = company?.business_profile || {}
  const clientContext = [
    company?.name, company?.industry,
    bp?.coreActivity || company?.description,
    Array.isArray(bp?.industryTags) ? bp.industryTags.slice(0, 4).join(', ') : '',
  ].filter(Boolean).join(' | ').slice(0, 500)

  const urls: Record<string, string> = competitor.urls || {}
  // EXACT BrightData request counting for the per-run cost (see client comment:
  // computed from OUR request count, not BrightData's billing API).
  const counter = new RequestCounter()

  // Every source runs INDEPENDENTLY — one failure never blocks the others.
  const sources: SourceResult[] = await Promise.all(
    INTEL_SOURCES.map(async (source): Promise<SourceResult> => {
      let url = (urls[source] || '').trim()
      // Auto-discover a social profile when blank (website is never guessed).
      if (!url && DISCOVER_HOST[source]) {
        try { url = await discoverProfileUrl(name, DISCOVER_HOST[source]!, counter) } catch { url = '' }
      }
      if (!url) return { source, status: 'skipped', error: 'no_url' }

      // SOCIAL sources use BrightData's DEDICATED scrapers (structured posts +
      // engagement + followers). Only the WEBSITE stays on the generic Web
      // Unlocker — a plain site has no dedicated scraper, and markdown is right
      // for it.
      if (source !== 'website') {
        const t = await scrapeSocialProfile(source as SocialPlatform, url, counter)
        return {
          source,
          status: t.status === 'processing' ? 'failed' : t.status,
          url,
          text: t.posts.length ? postsToText(t.posts, t.profile) : undefined,
          posts: t.posts.length ? t.posts : undefined,
          profile: t.profile,
          error: t.error,
        }
      }

      const r = await scrapeUrl(url, counter)
      return { source, status: r.status, url, text: r.text || undefined, error: r.error }
    }),
  )

  const briefing = await summarizeCompetitor({ competitorName: name, clientContext, sources })

  // ── Per-run cost ─────────────────────────────────────────────────────────
  // BrightData: EXACT — we counted every request we fired (incl. retries and
  // discovery searches) × the known per-request price. No billing API needed.
  // Model: exact when the provider returned real token counts, else estimated.
  const llm = briefing.llm
  const cost = {
    brightdata: {
      requests: counter.total,
      scrapes: counter.scrapes,
      searches: counter.searches,
      records: counter.records,
      perRequestUSD: BRIGHTDATA_COST_PER_REQ,
      perRecordUSD: BRIGHTDATA_RECORD_COST,
      costUSD: counter.costUSD,
      precision: 'exact' as const,
    },
    llm: llm
      ? { model: llm.model, promptTokens: llm.promptTokens, completionTokens: llm.completionTokens, costUSD: llm.costUSD, precision: llm.precision }
      : null,
    totalUSD: counter.costUSD + (llm?.costUSD || 0),
  }

  // Store raw + briefing + cost in the ISOLATED dev table (append, never overwrite).
  const { data: saved, error } = await db
    .from('competitor_intel_dev')
    .insert({ company_id: companyId, competitor_name: name, sources, briefing, cost })
    .select('id, competitor_name, sources, briefing, cost, created_at')
    .single()
  if (error) {
    // Still return the result so the sandbox is usable before the migration runs.
    return NextResponse.json({ success: true, stored: false, storeError: error.message, run: { competitor_name: name, sources, briefing, cost } })
  }

  // Keep only the latest RUN_HISTORY_CAP runs per company (same pattern as the
  // 26-cap on report snapshots) — history for comparison without re-scraping.
  try {
    const { data: rows } = await db
      .from('competitor_intel_dev').select('id').eq('company_id', companyId)
      .order('created_at', { ascending: false })
    const ids = (rows || []).map((r: any) => r.id)
    if (ids.length > RUN_HISTORY_CAP) {
      await db.from('competitor_intel_dev').delete().in('id', ids.slice(RUN_HISTORY_CAP))
    }
  } catch (e: any) {
    console.warn('[competitor-intel] prune failed:', e?.message)
  }

  return NextResponse.json({ success: true, stored: true, run: saved })
}
