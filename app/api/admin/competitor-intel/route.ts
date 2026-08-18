export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
// NOTE: scrapeTikTokProfile is intentionally NOT imported — TikTok was removed
// from the active source loop (unreliable). The function remains in the client.
import { scrapeUrl, discoverProfileUrl, isBrightDataConfigured } from '@/lib/brightdata/client'
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
    .select('id, competitor_name, sources, briefing, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(25)
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

  // Every source runs INDEPENDENTLY — one failure never blocks the others.
  const sources: SourceResult[] = await Promise.all(
    INTEL_SOURCES.map(async (source): Promise<SourceResult> => {
      let url = (urls[source] || '').trim()
      // Auto-discover a social profile when blank (website is never guessed).
      if (!url && DISCOVER_HOST[source]) {
        try { url = await discoverProfileUrl(name, DISCOVER_HOST[source]) } catch { url = '' }
      }
      if (!url) return { source, status: 'skipped', error: 'no_url' }

      const r = await scrapeUrl(url)
      return { source, status: r.status, url, text: r.text || undefined, error: r.error }
    }),
  )

  const briefing = await summarizeCompetitor({ competitorName: name, clientContext, sources })

  // Store raw + briefing in the ISOLATED dev table.
  const { data: saved, error } = await db
    .from('competitor_intel_dev')
    .insert({ company_id: companyId, competitor_name: name, sources, briefing })
    .select('id, competitor_name, sources, briefing, created_at')
    .single()
  if (error) {
    // Still return the result so the sandbox is usable before the migration runs.
    return NextResponse.json({ success: true, stored: false, storeError: error.message, run: { competitor_name: name, sources, briefing } })
  }

  return NextResponse.json({ success: true, stored: true, run: saved })
}
