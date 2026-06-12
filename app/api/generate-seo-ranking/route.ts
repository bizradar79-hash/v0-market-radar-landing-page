export const dynamic = 'force-dynamic'

import { getFullContext } from '@/lib/context'
import { analyzeBusinessForSearch } from '@/lib/analyze-business'
import { guardWrite, logKeptExisting } from '@/lib/scan/guard'
import { fetchSerp, findPosition, baseDomain as dfsBaseDomain } from '@/lib/seo/dataforseo'
import { ScanCostCollector } from '@/lib/scan/cost-tracker'
import { NextResponse } from 'next/server'
import type { BusinessProfile } from '@/types/business-profile'

export const maxDuration = 60

const CACHE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
// Default to real Google SERP via DataForSEO; 'grok' keeps the old web_search path.
const SEO_PROVIDER = (process.env.SEO_PROVIDER || 'dataforseo').toLowerCase()

function extractDomain(url: string): string {
  try {
    const hostname = new URL(url.startsWith('http') ? url : `https://${url}`).hostname.toLowerCase()
    // Remove www. and other common subdomains (shop., blog., m., etc.)
    return hostname.replace(/^(www\d?|m|shop|blog|store|mail|en|he)\./i, '')
  } catch { return '' }
}

// Extract only the registrable domain (e.g., example.co.il from sub.example.co.il)
function baseDomain(domain: string): string {
  if (!domain) return ''
  // Handle common multi-part TLDs: .co.il, .org.il, .net.il, .com.au etc.
  const parts = domain.split('.')
  if (parts.length >= 3) {
    const last2 = parts.slice(-2).join('.')
    const multiPartTlds = ['co.il', 'org.il', 'net.il', 'ac.il', 'gov.il', 'co.uk', 'com.au', 'co.nz']
    if (multiPartTlds.includes(last2)) return parts.slice(-3).join('.')
  }
  return parts.slice(-2).join('.')
}

function isOwnResult(r: any, companyName: string, companyDomain: string): boolean {
  const name = companyName.toLowerCase().trim()
  const domain = companyDomain.toLowerCase().trim()
  const base = baseDomain(domain)
  const resultRawDomain = extractDomain(r.url || '').toLowerCase().trim()
  const resultBase = baseDomain(resultRawDomain)
  const resultTitle = (r.title || r.name || '').toLowerCase().trim()
  const resultUrl = (r.url || '').toLowerCase().trim()
  const nameSlug = name.replace(/[\s\-_]+/g, '')

  const match = (
    (base.length >= 4 && resultBase === base) ||
    (domain.length >= 3 && (resultRawDomain.includes(domain) || resultUrl.includes(domain))) ||
    (name.length >= 3 && resultTitle.includes(name)) ||
    (nameSlug.length >= 4 && resultRawDomain.includes(nameSlug))
  )

  console.log(`[SEO isOwnResult] company="${companyName}" domain="${domain}" base="${base}" | result="${r.name}" url="${r.url}" resultBase="${resultBase}" → ${match}`)
  return match
}

function isLocalBusiness(overview: string, city: string, geoArea: string[]): boolean {
  if (!geoArea || geoArea.length === 0) return false
  if (geoArea.includes('כל הארץ') || geoArea.length > 2) return false
  const localKeywords = ['מקומי', 'באזור', 'בעיר', city].filter(Boolean)
  return geoArea.length <= 1 || localKeywords.some(k => overview.includes(k))
}

async function runSeoQuery(
  query: string,
  companyName: string,
  website: string,
  companyDomain: string,
  competitorWebsites: string[],
  isLocal: boolean,
  cost?: ScanCostCollector,
): Promise<{ position: number | null; topResults: string[]; appeared: boolean; results: any[] }> {
  const competitorListText = competitorWebsites.length > 0
    ? `\nאתרי מתחרים ידועים:\n${competitorWebsites.join('\n')}`
    : ''
  const localPackNote = isLocal
    ? `\nזהו חיפוש מקומי. כלול תוצאות מ-Google Maps / Local Pack אם מופיעות.`
    : ''

  const prompt = `אתה מומחה SEO ישראלי. השתמש ב-web_search לחיפוש: "${query}"${localPackNote}

פרטי העסק: שם: ${companyName} | אתר: ${website} | דומיין: ${companyDomain}
${competitorListText}

CRITICAL: דווח רק על URLs אמיתיים מהחיפוש. אל תבדה תוצאות.
סמן תוצאות ממומנות (מודעות/sponsored) עם is_sponsored: true.

לכל תוצאה ציין: position(1-10), name, url, title, isOwn(true אם דומיין מכיל "${companyDomain}"), isKnownCompetitor, is_sponsored(true אם מודעה ממומנת)

החזר JSON בלבד:
{"query": "${query}", "results": [{"position": 1, "name": "", "url": "", "title": "", "isOwn": false, "isKnownCompetitor": false, "is_sponsored": false}], "recommendations": []}

CRITICAL: Output ONLY a raw JSON object. No markdown. Start with { and end with }`

  const t0 = Date.now()
  let response: Response
  try {
    response = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.XAI_API_KEY}` },
      body: JSON.stringify({
        model: 'grok-4-fast-non-reasoning',
        input: [{ role: 'user', content: prompt }],
        tools: [{ type: 'web_search' }],
      }),
    })
  } catch (e) {
    cost?.add({ provider: 'xai', model: 'grok-4-fast-non-reasoning', webSearch: true, ms: Date.now() - t0 })
    throw e
  }

  const data = await response.json()
  cost?.add({ provider: 'xai', model: 'grok-4-fast-non-reasoning', webSearch: true, data, ms: Date.now() - t0 })
  if (!response.ok || !data.output) return { position: null, topResults: [], appeared: false, results: [] }

  const text = data.output
    .filter((item: any) => item.type === 'message')
    .flatMap((item: any) => item.content)
    .filter((c: any) => c.type === 'output_text')
    .map((c: any) => c.text)
    .join('')

  const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
  const s = clean.indexOf('{')
  const e = clean.lastIndexOf('}')
  if (s === -1 || e <= s) return { position: null, topResults: [], appeared: false, results: [] }

  let parsed: any = {}
  try { parsed = JSON.parse(clean.slice(s, e + 1)) } catch { return { position: null, topResults: [], appeared: false, results: [] } }

  const competitorDomains = competitorWebsites.map(w => baseDomain(extractDomain(w))).filter(Boolean)
  const rawResults: any[] = (Array.isArray(parsed.results) ? parsed.results : []).slice(0, 10)
  // Deduplicate by base domain (handles www.foo.co.il === foo.co.il === shop.foo.co.il)
  const seenDomains = new Set<string>()
  const results: any[] = []
  for (const r of rawResults) {
    const domain = baseDomain(extractDomain(r.url || '')) || (r.name || '').toLowerCase().trim()
    if (!domain || seenDomains.has(domain)) continue
    seenDomains.add(domain)
    results.push(r)
  }
  results.forEach((r: any) => {
    r.isOwn = isOwnResult(r, companyName, companyDomain)
    const rBase = baseDomain(extractDomain(r.url || ''))
    r.isKnownCompetitor = !r.isOwn && competitorDomains.some(d => d && rBase === d)
    if (typeof r.is_sponsored !== 'boolean') r.is_sponsored = false
  })

  // Use findIndex so position reflects actual array order, not Grok-reported number
  const ownIdx = results.findIndex(r => r.isOwn)
  const appeared = ownIdx !== -1
  const position = appeared ? ownIdx + 1 : null
  const topResults = results.filter(r => !r.isOwn).slice(0, 3).map(r => r.name).filter(Boolean)

  return {
    position,
    topResults,
    appeared,
    results,
  }
}

// ── DataForSEO runner (real Google SERP) ────────────────────────────────────

async function runSeoQueryDFS(
  query: string,
  companyName: string,
  website: string,
  companyDomain: string,
  competitorWebsites: string[],
): Promise<{ position: number | null; topResults: string[]; appeared: boolean; results: any[]; provider: string } | null> {
  const serp = await fetchSerp(query)
  if (!serp.ok) {
    console.error(`[SEO dfs] "${query}" failed:`, serp.error)
    return null // signal caller to fall back
  }

  const competitorDomains = competitorWebsites.map(w => dfsBaseDomain(w)).filter(Boolean)
  const ownBase = dfsBaseDomain(companyDomain)

  // Take top organic + paid, dedupe by base domain, cap 10.
  const seen = new Set<string>()
  const results: any[] = []
  for (const it of serp.items) {
    const base = dfsBaseDomain(it.domain || it.url)
    if (!base || seen.has(base)) continue
    seen.add(base)
    const isOwn = !!ownBase && base === ownBase
    results.push({
      position: it.rankGroup || it.rank,
      name: it.title || it.domain || base,
      url: it.url,
      title: it.title || '',
      isOwn,
      isKnownCompetitor: !isOwn && competitorDomains.some(d => d && base === d),
      is_sponsored: it.type === 'paid',
    })
    if (results.length >= 10) break
  }

  const { position, found } = findPosition(serp.items, companyDomain)
  const topResults = results.filter(r => !r.isOwn).slice(0, 3).map(r => r.name).filter(Boolean)

  return { position, topResults, appeared: found, results, provider: 'dataforseo' }
}

// ── Gemini validation step ─────────────────────────────────────────────────

async function reorderWithGemini(
  results: any[],
  query: string,
  cost?: ScanCostCollector,
): Promise<any[] | null> {
  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey || results.length === 0) return null
  const list = results.map(r => `${r.position}. ${r.name} (${r.url || ''})`).join('\n')
  const prompt = `בדוק את רשימת התוצאות הזו לשאילתה "${query}" בגוגל ישראל. סדר מחדש לפי דירוג גוגל האמיתי שאתה מכיר. החזר JSON בלבד: [{"rank": 1, "title": "", "domain": "", "is_sponsored": false}]\n\nהרשימה:\n${list}`
  const t0 = Date.now()
  try {
    let res: Response
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        }
      )
    } catch (e) {
      cost?.add({ provider: 'gemini', model: 'gemini-2.5-flash', ms: Date.now() - t0 })
      throw e
    }
    const data = await res.json()
    cost?.add({ provider: 'gemini', model: 'gemini-2.5-flash', data, ms: Date.now() - t0 })
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    const s = clean.indexOf('['); const e = clean.lastIndexOf(']')
    if (s === -1 || e <= s) return null
    const arr: any[] = JSON.parse(clean.slice(s, e + 1))
    if (!Array.isArray(arr) || arr.length === 0) return null
    // Merge Gemini ordering back into existing results
    const byName = new Map(results.map(r => [(r.name || '').toLowerCase(), r]))
    const byDomain = new Map(results.map(r => [(r.url || '').toLowerCase(), r]))
    const reordered: any[] = []
    for (const g of arr) {
      const key = (g.title || g.domain || '').toLowerCase()
      const existing = byName.get(key) || byDomain.get(key) || results.find(r =>
        (r.name || '').toLowerCase().includes(key) || key.includes((r.name || '').toLowerCase().slice(0, 5))
      )
      if (existing) {
        reordered.push({ ...existing, position: g.rank ?? reordered.length + 1, is_sponsored: g.is_sponsored ?? existing.is_sponsored })
      }
    }
    // Append any results Gemini didn't mention, at the end
    const reorderedIds = new Set(reordered.map(r => r.url))
    results.filter(r => !reorderedIds.has(r.url)).forEach((r, i) => {
      reordered.push({ ...r, position: reordered.length + i + 1 })
    })
    return reordered.length > 0 ? reordered : null
  } catch { return null }
}

export async function POST(request: Request) {
  let cost: ScanCostCollector | null = null
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    cost = new ScanCostCollector(ctx.user.id, 'seo_ranking')

    const force = new URL(request.url).searchParams.get('force') === 'true'
    if (!force) {
      const { data: company } = await ctx.supabase
        .from('companies').select('seo_ranking').eq('id', ctx.user.id).single()
      const cached = company?.seo_ranking as { fetchedAt?: string } | null
      if (cached?.fetchedAt) {
        const age = Date.now() - new Date(cached.fetchedAt).getTime()
        if (age < CACHE_MS) {
          console.log('[generate-seo-ranking] cache hit, age:', Math.round(age / 3600000), 'h')
          return NextResponse.json({ success: true, ...cached, cached: true })
        }
      }
    }

    const companyName = ctx.company?.name || ''
    const website = ctx.company?.website || ''
    const companyDomain = extractDomain(website)
    const city = ctx.company?.city || ''
    const industry = ctx.company?.industry || ''
    const overview = ctx.company?.business_overview || ctx.company?.description || ''
    const geoArea: string[] = ctx.company?.geographic_area || []
    const keywords: string[] = ctx.company?.keywords || []
    const scopes: string[] = Array.isArray(ctx.company?.geographic_scope)
      ? ctx.company.geographic_scope
      : [ctx.company?.geographic_scope || 'national']

    const isLocal = scopes.includes('local') || isLocalBusiness(overview, city, geoArea)
    const isInternational = scopes.includes('international')
    const scopeLocation = isLocal ? (city || 'ישראל') : isInternational ? 'ישראל ועולם' : 'ישראל'
    const scope = isLocal ? `חיפוש מקומי — ${scopeLocation}` : isInternational ? 'חיפוש בינלאומי' : 'חיפוש ארצי'

    const businessProfile = (ctx.company?.business_profile ?? null) as BusinessProfile | null
    const profileKeywords = businessProfile?.primaryKeywords?.slice(0, 3).join(' ') || ''
    const fallbackQuery = profileKeywords
      || [industry, scopeLocation, keywords.slice(0, 3).join(' ')].filter(Boolean).join(' ')
    const businessAnalysis = await analyzeBusinessForSearch(overview, city, isLocal, scopeLocation)
    const primaryQuery = businessAnalysis?.google_query || fallbackQuery

    // Query list = the company's own tracked keywords (the 5 best), so SEO
    // reflects the terms they actually care about. Fall back to profile
    // keywords / the analysed primary query when no keywords are set.
    let queryList: string[] = (keywords || [])
      .filter((k: any) => typeof k === 'string' && k.trim().length >= 2)
      .slice(0, 5)
    if (queryList.length === 0 && profileKeywords) queryList = [profileKeywords]
    if (queryList.length === 0) queryList = [primaryQuery]

    const savedCompetitors: any[] = ctx.competitors || []
    const competitorWebsites = savedCompetitors.map((c: any) => c.website).filter(Boolean).slice(0, 10)

    // Run each keyword: DataForSEO real SERP first, Grok web_search only as a
    // per-query fallback when DataForSEO fails (SEO_PROVIDER controls default).
    // Per-keyword status distinguishes a genuine "not found" (we got a SERP back
    // but the domain wasn't in it) from an "error" (the call failed / empty).
    let providerUsed = SEO_PROVIDER
    const variantResults = await Promise.all(
      queryList.map(async (q) => {
        let res: Awaited<ReturnType<typeof runSeoQuery>> & { provider?: string } | null = null
        if (SEO_PROVIDER === 'dataforseo') {
          const dfs = await runSeoQueryDFS(q, companyName, website, companyDomain, competitorWebsites)
          if (dfs) {
            res = dfs
          } else {
            providerUsed = 'grok_fallback'
          }
        }
        if (!res) {
          res = await runSeoQuery(q, companyName, website, companyDomain, competitorWebsites, isLocal, cost ?? undefined)
        }
        const resultCount = Array.isArray(res.results) ? res.results.length : 0
        const status: 'found' | 'not_found' | 'error' =
          res.appeared ? 'found' : resultCount > 0 ? 'not_found' : 'error'
        console.log('[seo]', q, status, res.position, resultCount)
        return { ...res, status, resultCount }
      })
    )

    // Gemini reorder only meaningful for the (less reliable) Grok path; with
    // DataForSEO the ranking is already real Google order.
    if (providerUsed !== 'dataforseo' && variantResults[0]) {
      const primaryReordered = await reorderWithGemini(variantResults[0].results, queryList[0], cost ?? undefined)
      if (primaryReordered) variantResults[0].results = primaryReordered
    }

    // Dedup each variant by base domain (within-query), then dedup across ALL queries globally
    // so the same domain never appears in more than one query variant
    const globalSeenDomains = new Set<string>()
    for (const v of variantResults) {
      const withinSeen = new Set<string>()
      v.results = v.results.filter((r: any) => {
        const raw = r.url ? extractDomain(r.url) : (r.name || '').toLowerCase()
        const base = baseDomain(raw) || raw
        if (!base || withinSeen.has(base) || globalSeenDomains.has(base)) return false
        withinSeen.add(base)
        globalSeenDomains.add(base)
        return true
      }).slice(0, 10)
    }

    const queryVariants = queryList.map((q, i) => ({
      query: q,
      position: variantResults[i].position,
      topResults: variantResults[i].topResults,
      appeared: variantResults[i].appeared,
      results: variantResults[i].results,
      status: variantResults[i].status, // 'found' | 'not_found' | 'error'
    }))

    // Per-keyword position summary { keyword, position, url, found, status }
    // status: 'found' | 'not_found' (SERP returned, domain absent) | 'error' (call failed/empty)
    const keywordPositions = queryList.map((q, i) => {
      const own = (variantResults[i].results || []).find((r: any) => r.isOwn)
      return {
        keyword: q,
        position: variantResults[i].position,
        url: own?.url || null,
        found: !!variantResults[i].appeared,
        status: variantResults[i].status,
        resultCount: variantResults[i].resultCount,
      }
    })

    // Primary result uses first query for backward-compat display
    const primaryVariant = variantResults[0]
    const competitorListText = competitorWebsites.length > 0
      ? `\nאתרי מתחרים ידועים לסימון:\n${competitorWebsites.join('\n')}`
      : ''
    const localPackNote = isLocal
      ? `\nשים לב: זהו חיפוש מקומי. כלול גם תוצאות מ-Google Maps / Local Pack אם מופיעות.`
      : ''

    // Build recommendations via second Grok call on primary query results
    const topNamesStr = primaryVariant.results.slice(0, 5).map(r => r.name).join(', ')
    const recsPrompt = `בהתבסס על תוצאות החיפוש "${primaryQuery}" שבהן מופיעים: ${topNamesStr}, כתוב 3 המלצות ספציפיות לשיפור דירוג SEO של ${companyName}. החזר JSON בלבד: {"recommendations": ["", "", ""]}. No markdown.`
    let recommendations: string[] = []
    const recsT0 = Date.now()
    try {
      let recsRes: Response
      try {
        recsRes = await fetch('https://api.x.ai/v1/responses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.XAI_API_KEY}` },
          body: JSON.stringify({ model: 'grok-4-fast-non-reasoning', input: [{ role: 'user', content: recsPrompt }] }),
        })
      } catch (e) {
        cost?.add({ provider: 'xai', model: 'grok-4-fast-non-reasoning', ms: Date.now() - recsT0 })
        throw e
      }
      const recsData = await recsRes.json()
      cost?.add({ provider: 'xai', model: 'grok-4-fast-non-reasoning', data: recsData, ms: Date.now() - recsT0 })
      const recsText = (recsData.output || [])
        .filter((i: any) => i.type === 'message').flatMap((i: any) => i.content)
        .filter((c: any) => c.type === 'output_text').map((c: any) => c.text).join('')
      const recsClean = recsText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
      const rs = recsClean.indexOf('{'); const re = recsClean.lastIndexOf('}')
      if (rs !== -1 && re > rs) {
        const recsParsed = JSON.parse(recsClean.slice(rs, re + 1))
        recommendations = Array.isArray(recsParsed.recommendations) ? recsParsed.recommendations.slice(0, 3) : []
      }
    } catch { /* fallback to empty */ }

    const result = {
      query: primaryQuery,
      results: primaryVariant.results,
      queryVariants,
      keywordPositions,
      provider: providerUsed,
      recommendations,
      isLocal,
      scope,
      what_business_does: businessAnalysis?.what_business_does || '',
      fetchedAt: new Date().toISOString(),
    }

    // Guard: don't overwrite a good ranking with an empty/degraded one.
    const { data: prevSeo } = await ctx.supabase
      .from('companies').select('seo_ranking').eq('id', ctx.user.id).single()
    const existingCount = Array.isArray(prevSeo?.seo_ranking?.results) ? prevSeo.seo_ranking.results.length : 0
    const newCount = Array.isArray(result.results) ? result.results.length : 0

    // Extra guard: if EVERY keyword errored (call failed / empty), this scan is
    // degraded — never clobber existing good data with it.
    const allErrored = keywordPositions.length > 0 && keywordPositions.every(k => k.status === 'error')
    if (allErrored && existingCount > 0) {
      await logKeptExisting(ctx.supabase, ctx.user.id, { module: 'seo_ranking', reason: 'all_keywords_error', existing_count: existingCount, new_count: newCount })
      return NextResponse.json({ success: true, kept_existing: true, reason: 'all_keywords_error', existing_count: existingCount, new_count: newCount })
    }

    const guard = guardWrite(existingCount, newCount)

    if (!guard.useNew) {
      await logKeptExisting(ctx.supabase, ctx.user.id, { module: 'seo_ranking', reason: guard.reason, existing_count: existingCount, new_count: newCount })
      return NextResponse.json({ success: true, kept_existing: true, reason: guard.reason, existing_count: existingCount, new_count: newCount })
    }

    await ctx.supabase.from('companies').update({ seo_ranking: result }).eq('id', ctx.user.id)

    return NextResponse.json({ success: true, ...result, businessAnalysis })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  } finally {
    await cost?.flush()
  }
}
