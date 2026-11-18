export const dynamic = 'force-dynamic'

import { getFullContext } from '@/lib/context'
import { search } from '@/lib/search'
import { callModel, SUPPORTED_PROVIDERS, isSupportedProvider } from '@/lib/call-model'
import { resolveDateVars } from '@/lib/resolve-prompt-vars'
import { filterInsertRows } from '@/lib/admin/hidden'
import { effectiveKeywords, fieldAnchor, phraseQuery, searchSubject } from '@/lib/keywords'
import { NextResponse } from 'next/server'
import type { BusinessProfile } from '@/types/business-profile'
import { NEWS_ENGINE } from '@/lib/flags'
import { fetchGoogleNews, resolveArticleLinks, selectArticles, type NewsArticle } from '@/lib/news/dataforseo-news'
import { ScanCostCollector } from '@/lib/scan/cost-tracker'

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

// ── DataForSEO Google News path (default engine) ─────────────────────────────

const NEWS_LIMIT = 12
const NEWS_MAX_AGE_DAYS = 30

/**
 * Google News via DataForSEO, keyword-driven (same keyword source as before).
 * Query 1: the client's field phrases OR-ed ("דיקור סיני" OR "רפואה סינית") —
 * quoted so a phrase can't be split into a word that means something else
 * (the "סיני" → China bug). Query 2 (only if query 1 is thin): the industry
 * anchor, so a niche business still gets field news. Hebrew, Israel.
 * Returns null when it produced nothing usable, so the caller can fall back.
 */
async function runDataForSeoPath(ctx: any, steps: Record<string, any>, cost: ScanCostCollector) {
  const bp = (ctx.company?.business_profile ?? null) as BusinessProfile | null
  const kws = effectiveKeywords(ctx.company, bp)
  const phrases = kws.slice(0, 3).map(k => k.trim()).filter(Boolean).map(k => (/\s/.test(k) ? `"${k}"` : k))
  const anchor = fieldAnchor(ctx.company, bp) || ctx.company?.industry || ''
  const queries: string[] = []
  if (phrases.length) queries.push(phrases.join(' OR '))
  if (anchor && !queries.includes(anchor)) queries.push(anchor)
  if (!queries.length) { steps.dataforseo = { skipped: 'no keywords or industry' }; return null }

  let pool: NewsArticle[] = []
  const runs: any[] = []
  for (const [i, q] of queries.entries()) {
    // The anchor query only runs when the keyword query came back thin.
    if (i > 0 && selectArticles(pool, { maxAgeDays: NEWS_MAX_AGE_DAYS, limit: NEWS_LIMIT }).length >= 6) break
    const t0 = Date.now()
    const r = await fetchGoogleNews(q, { locationName: 'Israel', languageCode: 'he', depth: 30 })
    cost.add({ provider: 'dataforseo', model: 'google_news', costUSD: r.costUSD, ms: Date.now() - t0 })
    runs.push({ query: q, ok: r.ok, count: r.articles.length, costUSD: r.costUSD, error: r.error, rawSample: i === 0 ? r.rawSample : undefined })
    if (r.ok) pool = pool.concat(r.articles)
  }
  steps.dataforseo = { runs }

  // Freshest window that still yields enough articles, but NEVER older than
  // ~4 months (owner's rule): fewer articles beat stale ones.
  const WINDOWS = [NEWS_MAX_AGE_DAYS, 90, 120]
  const MIN_ARTICLES = 6
  let windowDays = WINDOWS[WINDOWS.length - 1]
  for (const w of WINDOWS) {
    if (selectArticles(pool, { maxAgeDays: w, limit: NEWS_LIMIT }).length >= MIN_ARTICLES) { windowDays = w; break }
  }
  // Take a few extra: after resolving Google's redirect links, two results can
  // turn out to be the same article and collapse on de-duplication.
  let picked = selectArticles(pool, { maxAgeDays: windowDays, limit: NEWS_LIMIT + 6 })
  if (picked.length === 0) return null
  // google.com/goto?url=… → the real article URL + publisher name.
  const resolved = await resolveArticleLinks(picked)
  steps.linkResolution = { resolved: resolved.filter(a => !/google\./.test(a.domain)).length, of: resolved.length, windowDays }
  picked = selectArticles(resolved, { maxAgeDays: windowDays, limit: NEWS_LIMIT })

  const kept = await filterInsertRows(ctx.user.id, 'news', picked, (n: NewsArticle) => n.title)
  if (kept.length === 0) {
    await ctx.supabase.from('news').delete().eq('company_id', ctx.user.id)
    return NextResponse.json({ success: true, engine: 'dataforseo', news: [], count: 0, steps })
  }

  await ctx.supabase.from('news').delete().eq('company_id', ctx.user.id)
  const { data: saved, error: insertError } = await ctx.supabase.from('news').insert(
    kept.map((n: NewsArticle) => ({
      title: n.title,
      source: n.source,
      url: n.url,
      category: /\.(co|org|gov|ac|net)\.il$|\.il$/i.test(n.domain) ? 'ישראל' : 'עולם',
      sentiment: 'neutral',
      summary: n.snippet,
      company_id: ctx.user.id,
      // Real publish time from Google News (scan time only if Google had none).
      published_at: n.publishedAt || new Date().toISOString(),
    }))
  ).select()
  if (insertError) {
    steps.db = { ok: false, error: insertError.message, code: insertError.code }
    return NextResponse.json({ error: 'DB insert failed', steps }, { status: 500 })
  }
  steps.db = { ok: true, saved: saved?.length }
  return NextResponse.json({ success: true, engine: 'dataforseo', news: saved, count: saved?.length || 0, steps })
}

// ── POST ───────────────────────────────────────────────────────────────────


/**
 * SEARCH PATH (Tavily/Serper). Extracted so it can run BOTH when no active
 * prompt exists AND when the AI path throws — previously an AI failure meant no
 * news at all, because the fallback was unreachable once a prompt row existed.
 * Returns the response; never deletes existing rows unless it has items.
 */
async function runSearchPath(ctx: any, steps: Record<string, any>) {
    // ── Tavily fallback path ───────────────────────────────────────────────
  const businessOverview = ctx.company?.business_overview || ctx.company?.description || ''
  const industry = ctx.company?.industry || ''
  const businessProfile = (ctx.company?.business_profile ?? null) as BusinessProfile | null

  // Build queries KEYWORD-FIRST from the unified source (settings-editable, with
  // legacy primaryKeywords fallback). industryTags/searchQueries are demoted to a
  // fallback only — used just when the client has no keywords at all (so no client
  // ever gets zero queries). This is what connects settings edits → news search.
  const kws = effectiveKeywords(ctx.company, businessProfile)
  // PHRASES, not a word bag: `.join(' ')` turned ["דיקור סיני","רפואה סינית"]
  // into loose tokens, so "סיני" + "חדשות ישראל" matched news about CHINA.
  // Quoting keeps each field term intact, and the industry anchor pins the
  // result set to the client's profession rather than an ambiguous word.
  const kwHe = searchSubject(kws, ctx.company, businessProfile, 3)
  const kwTop = kws[0] ? phraseQuery([kws[0]], 1) : ''
  const heQuery = kwHe
    ? `${kwHe} חדשות ישראל`
    : businessProfile
      ? `${businessProfile.industryTags?.slice(0, 2).join(' ') || industry} חדשות ישראל`
      : `${industry} חדשות ישראל`
  const enQuery = kwTop
    ? `${kwTop} news`
    : businessProfile
      ? `${businessProfile.searchQueries?.[0] || industry} trends news`
      : `${industry} trends news`
  console.log('[news] queries →', JSON.stringify({ he: heQuery, en: enQuery }))

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

  // Guard: don't delete existing news when the fallback search came back empty.
  if (list.length === 0) {
    return NextResponse.json({ success: true, news: [], count: 0, kept_existing: true, steps })
  }

  // Respect admin-hidden items: a hidden news item must never be re-added.
  const keptList = await filterInsertRows(ctx.user.id, 'news', list, (n: any) => n.title || '')
  if (keptList.length === 0) {
    await ctx.supabase.from('news').delete().eq('company_id', ctx.user.id)
    return NextResponse.json({ success: true, news: [], count: 0, steps })
  }

  await ctx.supabase.from('news').delete().eq('company_id', ctx.user.id)

  const { data: saved, error: insertError } = await ctx.supabase.from('news').insert(
    keptList.map((n: any) => ({
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
}

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

    // ── DataForSEO Google News (default) ──────────────────────────────────────
    // Replaces the Grok web_search path. On failure/empty it falls back to the
    // cheap Tavily/Serper search path — never to Grok. Existing news is kept
    // when nothing comes back (the delete only happens with new items in hand).
    if (NEWS_ENGINE === 'dataforseo') {
      const cost = new ScanCostCollector(ctx.user.id, 'news')
      try {
        const viaDfs = await runDataForSeoPath(ctx, steps, cost)
        if (viaDfs) return viaDfs
        steps.fallback = 'dataforseo returned nothing → search path'
        return await runSearchPath(ctx, steps)
      } finally {
        await cost.flush()
      }
    }

    // ── AI path (NEWS_ENGINE=grok only): active prompt from prompt_versions ───
    const { data: activePrompt } = await ctx.supabase
      .from('prompt_versions')
      .select('prompt, model_provider, model_name')
      .eq('module', 'news')
      .eq('is_active', true)
      .maybeSingle()

    if (activePrompt) {
      steps.aiPath = { provider: activePrompt.model_provider, model: activePrompt.model_name }
      // A misconfigured prompt row is the classic sub-second failure: callModel
      // throws "Unknown provider" before any network call, and the old catch
      // turned that into a green check. Check it up front and say so plainly.
      if (!isSupportedProvider(activePrompt.model_provider)) {
        const msg = `prompt_versions.news has an unsupported model_provider: "${activePrompt.model_provider}". Supported: ${SUPPORTED_PROVIDERS.join(', ')}`
        console.error('[generate-news]', msg)
        steps.aiPath = { ...steps.aiPath, configError: msg }
        // Still try to give the client news rather than nothing.
        const viaSearch = await runSearchPath(ctx, steps).catch(() => null)
        if (viaSearch) return viaSearch
        return NextResponse.json({ error: msg, steps }, { status: 500 })
      }
      const bp = (ctx.company?.business_profile ?? null) as BusinessProfile | null
      // Unified keyword source (settings-editable, with legacy primaryKeywords fallback).
      const keywords: string[] = effectiveKeywords(ctx.company, bp)

      const coreActivity = bp?.coreActivity || ctx.company?.description || ctx.company?.industry || ''
      const products = bp?.products?.map((p: any) => p.name).join(', ') || keywords.slice(0, 3).join(', ') || ''
      const companyName = ctx.company?.name || ''
      const industry = ctx.company?.industry || coreActivity
      const targetAudience = (bp?.targetAudiences || ctx.company?.target_customers || []).join(', ')
      const competitorNames = (ctx.competitors || []).map((c: any) => c.name).join(', ')

      const companyContext = `הקשר חברה:
שם: ${companyName}
תחום: ${industry}
פעילות עיקרית: ${coreActivity}
מוצרים: ${products}
מילות מפתח: ${keywords.join(', ')}
קהל יעד: ${targetAudience}
מתחרים: ${competitorNames}
---
`
      // Replace template variables in the active prompt
      const resolvedPrompt = activePrompt.prompt
        .replace(/\{\{company_name\}\}/g, companyName)
        .replace(/\{\{industry\}\}/g, industry)
        .replace(/\{\{core_activity\}\}/g, coreActivity)
        .replace(/\{\{products\}\}/g, products)
        .replace(/\{\{keywords\}\}/g, keywords.join(', '))
        .replace(/\{\{website\}\}/g, ctx.company?.website || '')
        .replace(/\{\{target_audience\}\}/g, targetAudience)
        .replace(/\{\{competitors\}\}/g, competitorNames)

      const finalPrompt = resolveDateVars(companyContext + resolvedPrompt)

      try {
        const rawText = await callModel(activePrompt.model_provider, activePrompt.model_name, finalPrompt)
        steps.aiResult = { chars: rawText.length }

        // Parse JSON — strip markdown fences first, then try regex extraction
        let newsItems: any[] = []
        try {
          const clean = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
          const parsed = JSON.parse(clean)
          newsItems = Array.isArray(parsed) ? parsed : (parsed.news || [])
        } catch {
          try {
            const match = rawText.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
            if (match) {
              const parsed = JSON.parse(match[0])
              newsItems = Array.isArray(parsed) ? parsed : (parsed.news || [])
            }
          } catch {}
        }

        steps.aiParsed = { count: newsItems.length }

        if (newsItems.length > 0) {
          // Respect admin-hidden items: a hidden news item must never be re-added.
          const keptNews = await filterInsertRows(ctx.user.id, 'news', newsItems, (n: any) => n.title || '')
          await ctx.supabase.from('news').delete().eq('company_id', ctx.user.id)
          if (keptNews.length === 0) {
            return NextResponse.json({ success: true, news: [], count: 0, steps })
          }
          const { data: saved, error: insertError } = await ctx.supabase.from('news').insert(
            keptNews.map((n: any) => ({
              title: n.title || '',
              source: n.source || '',
              url: n.url || '',
              category: n.category || 'ישראל',
              sentiment: n.sentiment || 'neutral',
              summary: n.summary || '',
              company_id: ctx.user.id,
              published_at: new Date().toISOString(),
            }))
          ).select()
          if (insertError) {
            steps.db = { ok: false, error: insertError.message }
            return NextResponse.json({ error: 'DB insert failed', steps }, { status: 500 })
          }
          steps.db = { ok: true, saved: saved?.length }
          return NextResponse.json({ success: true, news: saved, count: saved?.length || 0, steps })
        }
        // The model returned nothing usable. Fall through to the search path
        // rather than reporting an empty success — the client still gets news,
        // and existing rows are preserved if search comes back empty too.
        steps.aiPath = { ...steps.aiPath, result: '0 items → falling back to search' }
        return await runSearchPath(ctx, steps)
      } catch (aiErr: any) {
        // FAIL LOUDLY. This used to return 200 success:true with 0 news, so a
        // broken model call showed as ✅ in admin while the client got nothing.
        const reason = aiErr?.message || 'unknown AI error'
        console.error('[generate-news] AI path FAILED:', reason)
        steps.aiPath = { ...steps.aiPath, error: reason }

        // Resilience first: try the search path so news still lands.
        try {
          const viaSearch = await runSearchPath(ctx, steps)
          const body = await viaSearch.clone().json().catch(() => ({} as any))
          if ((body?.count ?? 0) > 0) {
            steps.aiPath = { ...steps.aiPath, recovered: 'search fallback returned items' }
            return viaSearch
          }
        } catch (fbErr: any) {
          steps.searchFallback = { error: fbErr?.message || 'search fallback failed' }
        }

        // Neither path produced news → report a REAL failure with the reason.
        return NextResponse.json({
          error: `News generation failed (${activePrompt.model_provider}/${activePrompt.model_name}): ${reason}`,
          steps,
        }, { status: 500 })
      }
    }

    return await runSearchPath(ctx, steps)

  } catch (e: any) {
    console.error('generate-news error:', e?.message)
    return NextResponse.json({ error: e?.message, stack: e?.stack?.split('\n').slice(0, 4), steps }, { status: 500 })
  }
}
