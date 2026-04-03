export const dynamic = 'force-dynamic'

import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'
import type { BusinessProfile } from '@/types/business-profile'

export const maxDuration = 60

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

function isOwnResult(r: any, companyName: string, companyDomain: string): boolean {
  const domain = companyDomain.toLowerCase().trim()
  const resultUrl = (r.url || '').toLowerCase().trim()
  const resultTitle = (r.title || r.name || '').toLowerCase().trim()
  const name = companyName.toLowerCase().trim()
  // Domain match (most reliable)
  if (domain.length >= 3 && resultUrl.includes(domain)) return true
  // Exact title match only
  if (name.length >= 3 && resultTitle === name) return true
  return false
}

const CACHE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

const ENGINES = ['chatgpt', 'gemini', 'grok'] as const
type Engine = typeof ENGINES[number]

// ── Query generation ───────────────────────────────────────────────────────

async function buildSearchQuery(profileSummary: string): Promise<string | null> {
  if (!profileSummary.trim()) return null
  const prompt = `Based on this business: ${profileSummary}

What is the single most common search query a customer would type when looking for this type of business in Israel?
Return only the query, nothing else. Hebrew or English depending on the business. No explanation. No punctuation at the end.`

  try {
    const res = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.XAI_API_KEY}` },
      body: JSON.stringify({
        model: 'grok-4-fast-non-reasoning',
        input: [{ role: 'user', content: prompt }],
        // No web_search — pure reasoning
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const text = (data.output || [])
      .filter((i: any) => i.type === 'message')
      .flatMap((i: any) => i.content)
      .filter((c: any) => c.type === 'output_text')
      .map((c: any) => c.text)
      .join('')
      .trim()
      .replace(/^["']|["']$/g, '') // strip surrounding quotes if any
    return text.length > 3 ? text : null
  } catch { return null }
}

// ── Engine prompts ─────────────────────────────────────────────────────────

function buildEnginePrompt(
  engine: Engine,
  query: string,
  companyName: string,
  website: string,
  competitorNames: string[],
): string {
  const competitorLine = competitorNames.length > 0
    ? `\nKnown competitors: ${competitorNames.join(', ')}`
    : ''
  const jsonTemplate = `{"query": "${query}", "results": [{"position": 1, "name": "", "url": "", "isOwn": false, "isKnownCompetitor": false}], "userMentioned": false, "userPosition": null}`

  const bases: Record<Engine, string> = {
    general: `Use web_search to find the top 10 organic Google results for "${query}" in Israel.
List businesses/websites as they appear in Google search results.`,

    chatgpt: `Search for what ChatGPT recommends when asked: "${query}" in Israel.
Find screenshots, blog posts, or Reddit threads showing ChatGPT answers to this question.
List the top 10 businesses mentioned in ChatGPT responses you find online.`,

    gemini: `Search for what Google Gemini recommends when asked: "${query}" in Israel.
Find real examples of Gemini answers to this question — blog posts, screenshots, or forum discussions.
List the top 10 businesses mentioned in Gemini responses you find online.`,

    grok: `Use your live web search to directly search for "${query}" in Israel.
List the top 10 most relevant businesses or websites from your current search results.
Return fresh, current results. Do not copy from other AI engines.`,
  }

  return `${bases[engine]}
${competitorLine}

Check if ${companyName} (website: ${website}) appears in the list. (userMentioned: true/false, userPosition: number or null)

Return a ranked list of up to 10 businesses.

Return ONLY JSON:
${jsonTemplate}

CRITICAL: Output ONLY a raw JSON object. No markdown. Start with { and end with }`
}

// ── Shared result processor ────────────────────────────────────────────────

function processResults(
  rawResults: any[],
  companyName: string,
  companyDomain: string,
  competitorNames: string[],
): { position: number | null; topResults: string[]; appeared: boolean; results: any[] } {
  const seenDomains = new Set<string>()
  const results: any[] = []
  for (const r of rawResults.slice(0, 10)) {
    const domain = extractDomain(r.url || '') || r.name
    if (seenDomains.has(domain)) continue
    seenDomains.add(domain)
    results.push(r)
  }
  results.forEach((r: any) => {
    const own = isOwnResult(r, companyName, companyDomain)
    r.isOwn = own
    r.isCompany = own
    const rName = (r.name || '').toLowerCase()
    r.isKnownCompetitor = !own && competitorNames.some(n => {
      const nLower = n.toLowerCase()
      return nLower.length >= 3 && (rName.includes(nLower) || nLower.includes(rName))
    })
  })
  const ownResult = results.find(r => r.isOwn)
  const appeared = !!ownResult && ownResult.position != null
  const position = appeared ? (ownResult!.position ?? null) : null
  const topResults = results.filter(r => !r.isOwn).slice(0, 3).map(r => r.name).filter(Boolean)
  return { position, topResults, appeared, results }
}

// ── Gemini engine (direct API) ─────────────────────────────────────────────

async function runGeminiEngine(
  query: string,
  companyName: string,
  website: string,
  competitorNames: string[],
  industry?: string,
): Promise<{ position: number | null; topResults: string[]; appeared: boolean; results: any[] }> {
  const companyDomain = extractDomain(website)
  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) return { position: null, topResults: [], appeared: false, results: [] }

  const industryDesc = industry || query
  const prompt = `אני מחפש המלצות על ${industryDesc} בישראל. איזה עסקים או פלטפורמות היית ממליץ? רשום את 10 הטובים ביותר לפי סדר עדיפות. החזר JSON בלבד: [{"rank": 1, "name": "", "domain": "", "reason": ""}]`

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    )
    const data = await res.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    const s = clean.indexOf('[')
    const e = clean.lastIndexOf(']')
    if (s === -1 || e <= s) return { position: null, topResults: [], appeared: false, results: [] }
    const arr: any[] = JSON.parse(clean.slice(s, e + 1))
    const rawResults = arr.map((item: any, idx: number) => ({
      position: item.rank ?? idx + 1,
      name: item.name || '',
      url: item.domain ? `https://${item.domain}` : '',
      title: item.name || '',
    }))
    return processResults(rawResults, companyName, companyDomain, competitorNames)
  } catch { return { position: null, topResults: [], appeared: false, results: [] } }
}

// ── Grok engine runner ─────────────────────────────────────────────────────

async function runGeoQuestion(
  query: string,
  companyName: string,
  website: string,
  competitorNames: string[],
  engine: Engine = 'general',
  industry?: string,
): Promise<{ position: number | null; topResults: string[]; appeared: boolean; results: any[] }> {
  if (engine === 'gemini') return runGeminiEngine(query, companyName, website, competitorNames, industry)

  const prompt = buildEnginePrompt(engine, query, companyName, website, competitorNames)
  const companyDomain = extractDomain(website)

  const response = await fetch('https://api.x.ai/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.XAI_API_KEY}` },
    body: JSON.stringify({
      model: 'grok-4-fast-non-reasoning',
      tools: [{ type: 'web_search' }],
      input: [{ role: 'user', content: prompt }],
    }),
  })

  const data = await response.json()
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

  const rawResults: any[] = (Array.isArray(parsed.results) ? parsed.results : [])
  return processResults(rawResults, companyName, companyDomain, competitorNames)
}

// ── POST ───────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const force = new URL(request.url).searchParams.get('force') === 'true'
    if (!force) {
      const { data: company } = await ctx.supabase
        .from('companies').select('geo_ranking').eq('id', ctx.user.id).single()
      const cached = company?.geo_ranking as { fetchedAt?: string } | null
      if (cached?.fetchedAt) {
        const age = Date.now() - new Date(cached.fetchedAt).getTime()
        if (age < CACHE_MS) {
          console.log('[generate-geo-ranking] cache hit, age:', Math.round(age / 3600000), 'h')
          return NextResponse.json({ success: true, ...cached, cached: true })
        }
      }
    }

    const companyName = ctx.company?.name || ''
    const website = ctx.company?.website || ''
    const city = ctx.company?.city || ''
    const industry = ctx.company?.industry || ''
    const overview = ctx.company?.business_overview || ctx.company?.description || ''
    const geoArea: string[] = ctx.company?.geographic_area || []
    const keywords: string[] = ctx.company?.keywords || []
    const scopes: string[] = Array.isArray(ctx.company?.geographic_scope)
      ? ctx.company.geographic_scope
      : [ctx.company?.geographic_scope || 'national']

    const isLocal = scopes.includes('local') || !!(
      geoArea.length > 0 &&
      !geoArea.includes('כל הארץ') &&
      geoArea.length <= 2 &&
      (geoArea.length === 1 || ['מקומי', 'באזור', 'בעיר', city].filter(Boolean).some(k => overview.includes(k)))
    )
    const isInternational = scopes.includes('international')
    const scopeLocation = isLocal ? (city || 'ישראל') : isInternational ? 'ישראל ועולם' : 'ישראל'
    const scope = isLocal ? `חיפוש מקומי — ${scopeLocation}` : isInternational ? 'חיפוש בינלאומי' : 'חיפוש ארצי'

    const businessProfile = (ctx.company?.business_profile ?? null) as BusinessProfile | null

    // Build rich profile summary for query generation
    const profileParts = [
      overview,
      industry ? `Industry: ${industry}` : '',
      city && isLocal ? `Location: ${city}` : '',
      businessProfile?.coreActivity ? `Core activity: ${businessProfile.coreActivity}` : '',
      businessProfile?.products?.length ? `Products/services: ${businessProfile.products.slice(0, 3).map((p: any) => p.name).join(', ')}` : '',
      businessProfile?.targetAudiences?.length ? `Target audience: ${businessProfile.targetAudiences.slice(0, 3).join(', ')}` : '',
      keywords.length ? `Keywords: ${keywords.slice(0, 5).join(', ')}` : '',
    ].filter(Boolean).join('\n')

    // Generate query dynamically from profile (Grok reasoning, no web_search)
    const generatedQuery = await buildSearchQuery(profileParts)

    // Fallback if query generation fails
    const coreActivityDesc = businessProfile?.coreActivity || industry
    const fallbackQuery = isLocal
      ? `${coreActivityDesc} ${scopeLocation}`
      : `${coreActivityDesc} ישראל`
    const primaryQuery = generatedQuery || fallbackQuery

    const savedCompetitors: any[] = ctx.competitors || []
    const competitorNames = savedCompetitors.map((c: any) => c.name).filter(Boolean).slice(0, 10)

    // Run all 4 engines in parallel (pass industry for Gemini)
    const geminiIndustry = businessProfile?.coreActivity || industry
    const engineResults = await Promise.all(
      ENGINES.map(engine => runGeoQuestion(primaryQuery, companyName, website, competitorNames, engine, geminiIndustry))
    )

    const engines: Record<string, { results: any[]; appeared: boolean; position: number | null; topResults: string[] }> = {}
    ENGINES.forEach((engine, i) => {
      engines[engine] = {
        results: engineResults[i].results,
        appeared: engineResults[i].appeared,
        position: engineResults[i].position,
        topResults: engineResults[i].topResults,
      }
    })

    // Overlap detection — retry if >60% overlap between engine pairs
    const enginePairs: [Engine, Engine][] = [
      ['chatgpt', 'gemini'],
      ['chatgpt', 'grok'],
      ['gemini', 'grok'],
    ]
    for (const [refEngine, targetEngine] of enginePairs) {
      const refNames = new Set((engines[refEngine]?.results || []).map((r: any) => (r.name || '').toLowerCase()))
      const targetNamesList = (engines[targetEngine]?.results || []).map((r: any) => (r.name || '').toLowerCase())
      if (refNames.size === 0 || targetNamesList.length === 0) continue
      const overlap = targetNamesList.filter(n => refNames.has(n)).length / targetNamesList.length
      if (overlap > 0.6) {
        const overlappingNames = (engines[targetEngine]?.results || [])
          .filter((r: any) => refNames.has((r.name || '').toLowerCase()))
          .map((r: any) => r.name || '').slice(0, 5).join(', ')
        const retryResult = await runGeoQuestion(
          `${primaryQuery} — exclude these: ${overlappingNames}`,
          companyName, website, competitorNames, targetEngine
        )
        engines[targetEngine] = {
          results: retryResult.results,
          appeared: retryResult.appeared,
          position: retryResult.position,
          topResults: retryResult.topResults,
        }
        break
      }
    }

    // Recommendations via Grok (no web_search)
    const recsPrompt = `Write 3 specific recommendations for how ${companyName} (${industry}) can improve its presence in AI engines like ChatGPT, Grok, Gemini and Perplexity when people search for "${primaryQuery}". Return JSON only: {"recommendations": ["", "", ""]}. No markdown.`
    let recommendations: string[] = []
    try {
      const recsRes = await fetch('https://api.x.ai/v1/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.XAI_API_KEY}` },
        body: JSON.stringify({ model: 'grok-4-fast-non-reasoning', input: [{ role: 'user', content: recsPrompt }] }),
      })
      const recsData = await recsRes.json()
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

    const primary = engineResults[0]

    const result = {
      query: primaryQuery,
      results: primary.results,
      userMentioned: primary.appeared,
      userPosition: primary.position,
      engines,
      recommendations,
      isLocal,
      scope,
      fetchedAt: new Date().toISOString(),
    }

    await ctx.supabase.from('companies').update({ geo_ranking: result }).eq('id', ctx.user.id)

    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
