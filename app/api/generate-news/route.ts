export const dynamic = 'force-dynamic'

import { getFullContext } from '@/lib/context'
import { search } from '@/lib/search'
import { NextResponse } from 'next/server'
import type { BusinessProfile } from '@/types/business-profile'

export const maxDuration = 60

const CACHE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

// ── URL helpers ────────────────────────────────────────────────────────────

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

function isHomepage(url: string): boolean {
  try {
    const u = new URL(url)
    return u.pathname === '/' || u.pathname === ''
  } catch { return true }
}

const VALID_DOMAINS = [
  'ynet.co.il', 'haaretz.co.il', 'haaretz.com', 'mako.co.il', 'calcalist.co.il',
  'globes.co.il', 'walla.co.il', 'n12.co.il', 'kan.org.il', 'themarker.com',
  'maariv.co.il', 'inn.co.il', 'srugim.co.il', 'ice.co.il',
  'techcrunch.com', 'reuters.com', 'bbc.com', 'bbc.co.uk', 'theverge.com',
  'bloomberg.com', 'wsj.com', 'ft.com', 'forbes.com', 'nytimes.com',
  'washingtonpost.com', 'theguardian.com', 'apnews.com', 'cnbc.com', 'wired.com',
]

function isValidDomain(url: string): boolean {
  if (!url.startsWith('http')) return false
  if (isHomepage(url)) return false
  const host = extractDomain(url)
  return VALID_DOMAINS.some(d => host === d || host.endsWith('.' + d))
}

// ── Tavily fetch ───────────────────────────────────────────────────────────

async function fetchNewsFromTavily(heQuery: string, enQuery: string): Promise<any[]> {
  const year = new Date().getFullYear()
  const today = new Date().toISOString().split('T')[0]

  const [ilRaw, intlRaw] = await Promise.all([
    search(`${heQuery} ${year}`, 10),
    search(`${enQuery} ${year}`, 5),
  ])

  const mapResult = (r: any, region: string) => ({
    title: r.title || '',
    url: r.url || '',
    source: extractDomain(r.url || ''),
    date: today,
    summary: (r.content || '').slice(0, 200),
    relevance_score: Math.round((r.score ?? 0.5) * 100),
    region,
  })

  return [
    ...ilRaw.map(r => mapResult(r, 'ישראל')),
    ...intlRaw.map(r => mapResult(r, 'עולם')),
  ]
}

// ── POST ───────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const steps: Record<string, any> = {}
  try {
    steps.context = 'starting'
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized', steps }, { status: 401 })
    steps.context = { ok: true, company: ctx.company?.name }

    const force = new URL(request.url).searchParams.get('force') === 'true'
    if (!force) {
      const { data: latest } = await ctx.supabase
        .from('news').select('created_at').eq('company_id', ctx.user.id)
        .order('created_at', { ascending: false }).limit(1).single()
      if (latest?.created_at) {
        const age = Date.now() - new Date(latest.created_at).getTime()
        if (age < CACHE_MS) {
          console.log('[generate-news] cache hit, age:', Math.round(age / 3600000), 'h')
          return NextResponse.json({ success: true, cached: true })
        }
      }
    }

    const businessOverview = ctx.company?.business_overview || ctx.company?.description || ''
    const industry = ctx.company?.industry || ''
    const businessProfile = (ctx.company?.business_profile ?? null) as BusinessProfile | null

    // Build queries dynamically from business profile
    const heQuery = businessProfile
      ? `${businessProfile.industryTags.slice(0, 2).join(' ')} חדשות ישראל`
      : `${industry} חדשות ישראל`
    const enQuery = businessProfile
      ? `${businessProfile.searchQueries[0] || industry} trends news`
      : `${industry} trends news`

    let list = await fetchNewsFromTavily(heQuery, enQuery)
    steps.tavily = { count: list.length }

    // Deduplicate by URL
    const seenUrls = new Set<string>()
    list = list.filter((n: any) => {
      const url = (n.url || '').toLowerCase()
      if (!url || seenUrls.has(url)) return false
      seenUrls.add(url)
      return true
    })

    // VALID_DOMAINS filter — reject hallucinated / unverified URLs
    list = list.filter((n: any) => isValidDomain(n.url || ''))
    steps.urlValidation = { count: list.length }

    // Broader fallback if fewer than 8 results
    if (list.length < 8) {
      const broader = businessProfile?.industryTags?.slice(0, 2).join(' ')
        || businessOverview.split(' ').slice(0, 4).join(' ')
      const broadYear = new Date().getFullYear()
      const broadRaw = await search(`${broader} חדשות ${broadYear}`, 10)
      const today2 = new Date().toISOString().split('T')[0]
      const list2 = broadRaw
        .map((r: any) => ({
          title: r.title || '',
          url: r.url || '',
          source: extractDomain(r.url || ''),
          date: today2,
          summary: (r.content || '').slice(0, 200),
          relevance_score: Math.round((r.score ?? 0.5) * 100),
          region: 'ישראל',
        }))
        .filter((n: any) => isValidDomain(n.url || ''))

      const existingUrls = new Set(list.map((n: any) => (n.url || '').toLowerCase()))
      for (const item of list2) {
        if (!existingUrls.has((item.url || '').toLowerCase())) {
          list.push(item)
          existingUrls.add((item.url || '').toLowerCase())
        }
      }
      steps.broadenedSearch = { extra: list2.length, total: list.length }
    }

    steps.db = 'starting'
    await ctx.supabase.from('news').delete().eq('company_id', ctx.user.id)

    if (list.length === 0) {
      return NextResponse.json({ success: true, news: [], count: 0, steps })
    }

    const { data: saved, error: insertError } = await ctx.supabase.from('news').insert(
      list.map((n: any) => ({
        title: n.title || '',
        source: n.source || '',
        url: n.url || '',
        category: n.region === 'עולם' ? 'עולם' : 'ישראל',
        sentiment: 'neutral',
        summary: n.summary || '',
        company_id: ctx.user.id,
        published_at: n.date ? new Date(n.date).toISOString() : new Date().toISOString(),
      }))
    ).select()

    if (insertError) {
      steps.db = { ok: false, error: insertError.message, code: insertError.code }
      return NextResponse.json({ error: 'DB insert failed', steps }, { status: 500 })
    }
    steps.db = { ok: true, saved: saved?.length }

    return NextResponse.json({ success: true, news: saved, count: saved?.length || 0, steps })
  } catch (e: any) {
    console.error('generate-news error:', e?.message)
    return NextResponse.json({ error: e?.message, stack: e?.stack?.split('\n').slice(0, 4), steps }, { status: 500 })
  }
}
