export const dynamic = 'force-dynamic'

import { getFullContext } from '@/lib/context'
import { guardWrite, logKeptExisting } from '@/lib/scan/guard'
import { NextResponse } from 'next/server'
import type { BusinessProfile } from '@/types/business-profile'

export const maxDuration = 120

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

const ENGINES = ['general', 'chatgpt', 'gemini', 'grok'] as const
type Engine = typeof ENGINES[number]

// ── Query generation ───────────────────────────────────────────────────────

async function buildSearchQuery(coreActivity: string, industry: string): Promise<string | null> {
  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) return null
  const desc = (coreActivity || industry).trim()
  if (!desc) return null
  const prompt = `העסק מייצר/מוכר: ${desc}. מה השאילתה הכי ספציפית שלקוח ישראלי יחפש כדי למצוא עסק כזה? 3-5 מילים בלבד. ללא הסברים. רק השאילתה.`
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    )
    if (!res.ok) { console.error('[GEO buildQuery] Gemini HTTP:', res.status); return null }
    const data = await res.json()
    const text = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim()
      .replace(/^["'״]|["'״]$/g, '')
      .split('\n')[0] // take first line only in case of multi-line response
      .trim()
    console.log('[GEO buildQuery] generated:', text)
    // Validate: must be a short query (3–50 chars), not a full description
    if (text.length >= 3 && text.length <= 50) return text
    console.warn('[GEO buildQuery] response too long or too short, using fallback:', text.slice(0, 80))
    return null
  } catch (err) { console.error('[GEO buildQuery] error:', err); return null }
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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    )
    if (!res.ok) {
      console.error('[GEO gemini] HTTP error:', res.status, await res.text())
      return { position: null, topResults: [], appeared: false, results: [] }
    }
    const data = await res.json()
    if (data.error) {
      console.error('[GEO gemini] API error:', JSON.stringify(data.error))
      return { position: null, topResults: [], appeared: false, results: [] }
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    if (!text) {
      console.error('[GEO gemini] empty response, full data:', JSON.stringify(data).slice(0, 500))
      return { position: null, topResults: [], appeared: false, results: [] }
    }
    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    const s = clean.indexOf('[')
    const e = clean.lastIndexOf(']')
    if (s === -1 || e <= s) {
      console.error('[GEO gemini] no JSON array in response:', clean.slice(0, 200))
      return { position: null, topResults: [], appeared: false, results: [] }
    }
    let arr: any[] = JSON.parse(clean.slice(s, e + 1))
    // If empty — retry once with simpler prompt
    if (!Array.isArray(arr) || arr.length === 0) {
      console.log('[GEO gemini] empty array, retrying with simple prompt')
      const retryPrompt = `רשום 10 חברות ישראליות שמוכרות ${query}. JSON: [{"rank": 1, "name": "", "domain": ""}]`
      const retryRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: retryPrompt }] }] }),
        }
      )
      if (retryRes.ok) {
        const retryData = await retryRes.json()
        const retryText = retryData.candidates?.[0]?.content?.parts?.[0]?.text || ''
        const rc = retryText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
        const rs = rc.indexOf('['); const re = rc.lastIndexOf(']')
        if (rs !== -1 && re > rs) {
          try { arr = JSON.parse(rc.slice(rs, re + 1)) } catch { /* keep empty */ }
        }
      }
    }
    const rawResults = arr.map((item: any, idx: number) => ({
      position: item.rank ?? idx + 1,
      name: item.name || '',
      url: item.domain ? `https://${item.domain}` : '',
      title: item.name || '',
    }))
    return processResults(rawResults, companyName, companyDomain, competitorNames)
  } catch (err) {
    console.error('[GEO gemini] exception:', err)
    return { position: null, topResults: [], appeared: false, results: [] }
  }
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
  if (!response.ok || !data.output) {
    console.error(`[GEO ${engine}] Grok error: status=${response.status}`, JSON.stringify(data).slice(0, 300))
    return { position: null, topResults: [], appeared: false, results: [] }
  }

  const text = data.output
    .filter((item: any) => item.type === 'message')
    .flatMap((item: any) => item.content)
    .filter((c: any) => c.type === 'output_text')
    .map((c: any) => c.text)
    .join('')

  const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
  const s = clean.indexOf('{')
  const e = clean.lastIndexOf('}')
  if (s === -1 || e <= s) {
    console.error(`[GEO ${engine}] no JSON in Grok response:`, clean.slice(0, 200))
    return { position: null, topResults: [], appeared: false, results: [] }
  }

  let parsed: any = {}
  try { parsed = JSON.parse(clean.slice(s, e + 1)) } catch (err) {
    console.error(`[GEO ${engine}] JSON parse error:`, err)
    return { position: null, topResults: [], appeared: false, results: [] }
  }

  const rawResults: any[] = (Array.isArray(parsed.results) ? parsed.results : [])
  return processResults(rawResults, companyName, companyDomain, competitorNames)
}

// ── POST ───────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const force = new URL(request.url).searchParams.get('force') === 'true'

    // Fetch both geo_ranking (cache check) and seo_ranking (query reuse) in one query
    const { data: company } = await ctx.supabase
      .from('companies').select('geo_ranking, seo_ranking').eq('id', ctx.user.id).single()

    if (!force) {
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
    const coreActivityDesc = businessProfile?.coreActivity || industry
    const geminiIndustry = coreActivityDesc

    // ── Build query list ────────────────────────────────────────────────────
    // 1. Reuse SEO queryVariants if fresh enough (avoids duplicate API calls)
    let queryList: string[] = []
    const seoVariants = (company?.seo_ranking as any)?.queryVariants
    if (Array.isArray(seoVariants) && seoVariants.length >= 2) {
      queryList = seoVariants.map((v: any) => v.query).filter(Boolean).slice(0, 5)
      console.log('[GEO] reusing SEO queries:', queryList)
    }

    // 2. Generate fresh 5 queries via Gemini if no SEO queries available
    if (queryList.length === 0) {
      const geminiKey = process.env.GEMINI_API_KEY
      if (geminiKey && businessProfile) {
        try {
          const coreDesc = businessProfile.coreActivity || overview.slice(0, 120)
          const qPrompt = `העסק: ${coreDesc}. צור 5 שאילתות חיפוש שונות שלקוח ישראלי יחפש בגוגל כדי למצוא עסק כזה. כל שאילתה 2-5 מילים. החזר JSON בלבד: [string, string, string, string, string]`
          const qRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contents: [{ parts: [{ text: qPrompt }] }] }),
            }
          )
          if (qRes.ok) {
            const qData = await qRes.json()
            const qText = qData.candidates?.[0]?.content?.parts?.[0]?.text || ''
            const qClean = qText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
            const qs = qClean.indexOf('['); const qe = qClean.lastIndexOf(']')
            if (qs !== -1 && qe > qs) {
              const arr = JSON.parse(qClean.slice(qs, qe + 1))
              if (Array.isArray(arr)) {
                queryList = arr.filter((q: any) => typeof q === 'string' && q.length >= 3).slice(0, 5)
              }
            }
          }
        } catch { /* fallback below */ }
      }
    }

    // 3. Fallback: single query
    if (queryList.length === 0) {
      const specificDesc = (businessProfile?.products as any[])?.[0]?.name || coreActivityDesc
      const generatedQuery = await buildSearchQuery(specificDesc, industry)
      const fallbackQuery = isLocal ? `${coreActivityDesc} ${scopeLocation}` : `${coreActivityDesc} ישראל`
      queryList = [generatedQuery || fallbackQuery]
    }

    const primaryQuery = queryList[0]
    const savedCompetitors: any[] = ctx.competitors || []
    const competitorNames = savedCompetitors.map((c: any) => c.name).filter(Boolean).slice(0, 10)

    // ── Run all queries × all 3 engines in parallel ─────────────────────────
    const queryVariantResults = await Promise.all(
      queryList.map(async (q) => {
        const [chatgptRes, geminiRes, grokRes] = await Promise.all([
          runGeoQuestion(q, companyName, website, competitorNames, 'chatgpt', geminiIndustry),
          runGeoQuestion(q, companyName, website, competitorNames, 'gemini', geminiIndustry),
          runGeoQuestion(q, companyName, website, competitorNames, 'grok'),
        ])
        return { query: q, chatgpt: chatgptRes, gemini: geminiRes, grok: grokRes }
      })
    )

    // Build queryResults map: query → { chatgpt, gemini, grok }
    const queryResults: Record<string, any> = {}
    for (const qr of queryVariantResults) {
      queryResults[qr.query] = { chatgpt: qr.chatgpt, gemini: qr.gemini, grok: qr.grok }
    }

    // Primary engines (first query) for backward compat
    const primary = queryVariantResults[0]
    const engines = {
      chatgpt: primary.chatgpt,
      gemini: primary.gemini,
      grok: primary.grok,
    }

    console.log('[GEO] queries:', queryList.length, JSON.stringify(
      queryVariantResults.map(qr => ({
        query: qr.query.slice(0, 30),
        chatgpt: qr.chatgpt.results.length,
        gemini: qr.gemini.results.length,
        grok: qr.grok.results.length,
      }))
    ))

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

    const result = {
      query: primaryQuery,
      queries: queryList,
      queryResults,
      results: primary.chatgpt.results,  // backward compat
      userMentioned: primary.chatgpt.appeared,
      userPosition: primary.chatgpt.position,
      engines,  // backward compat: primary query engines
      recommendations,
      isLocal,
      scope,
      fetchedAt: new Date().toISOString(),
    }

    // Guard: don't overwrite a good ranking with an empty/degraded one.
    const { data: prevGeo } = await ctx.supabase
      .from('companies').select('geo_ranking').eq('id', ctx.user.id).single()
    const existingCount = Array.isArray(prevGeo?.geo_ranking?.results) ? prevGeo.geo_ranking.results.length : 0
    const newCount = Array.isArray(result.results) ? result.results.length : 0
    const guard = guardWrite(existingCount, newCount)

    if (!guard.useNew) {
      await logKeptExisting(ctx.supabase, ctx.user.id, { module: 'geo_ranking', reason: guard.reason, existing_count: existingCount, new_count: newCount })
      return NextResponse.json({ success: true, kept_existing: true, reason: guard.reason, existing_count: existingCount, new_count: newCount })
    }

    await ctx.supabase.from('companies').update({ geo_ranking: result }).eq('id', ctx.user.id)

    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
