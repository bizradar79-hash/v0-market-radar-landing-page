export const dynamic = 'force-dynamic'

import { getFullContext } from '@/lib/context'
import { guardWrite, logKeptExisting } from '@/lib/scan/guard'
import { fetchOpenAIGeoRaw } from '@/lib/geo/openai-engine'
import { ScanCostCollector } from '@/lib/scan/cost-tracker'
import { NextResponse } from 'next/server'
import type { BusinessProfile } from '@/types/business-profile'

export const maxDuration = 120

// 3 queries × 3 real engines (Grok, OpenAI, Gemini). Cap via env.
const GEO_QUERY_LIMIT = Math.max(1, parseInt(process.env.GEO_QUERY_LIMIT || '3', 10) || 3)

// TIME fix — hard per-engine timeout (shared with the OpenAI engine). Prevents a
// single hanging engine (live web_search can stall for minutes) from dragging
// the whole GEO route to its maxDuration → 504 → chain-resume re-running GEO and
// double-billing. A timed-out engine just yields an empty result for that cell.
const GEO_ENGINE_TIMEOUT_MS = Math.max(
  5_000,
  parseInt(process.env.GEO_ENGINE_TIMEOUT_MS || '30000', 10) || 30_000,
)

/** fetch() with an AbortController deadline. Rejects with AbortError on timeout. */
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = GEO_ENGINE_TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

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

// Real engines only: 'openai' = ChatGPT (Responses API + web_search),
// 'gemini' = Google API, 'grok' = xAI. ('general' kept for legacy callers.)
const ENGINES = ['general', 'openai', 'gemini', 'grok'] as const
type Engine = typeof ENGINES[number]

// ── Query generation ───────────────────────────────────────────────────────

async function buildSearchQuery(coreActivity: string, industry: string): Promise<string | null> {
  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) return null
  const desc = (coreActivity || industry).trim()
  if (!desc) return null
  const prompt = `העסק מייצר/מוכר: ${desc}. מה השאילתה הכי ספציפית שלקוח ישראלי יחפש כדי למצוא עסק כזה? 3-5 מילים בלבד. ללא הסברים. רק השאילתה.`
  try {
    const res = await fetchWithTimeout(
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

  // Only 'general' and 'grok' actually reach this function — 'openai' and
  // 'gemini' are handled by dedicated runners before buildEnginePrompt is called.
  const bases: Record<Engine, string> = {
    general: `Use web_search to find the top 10 organic Google results for "${query}" in Israel.
List businesses/websites as they appear in Google search results.`,

    openai: `Use your live web search to directly search for "${query}" in Israel.
List the top 10 most relevant businesses or websites.`,

    gemini: `Search for what Google Gemini recommends when asked: "${query}" in Israel.
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
  cost?: ScanCostCollector,
): Promise<{ position: number | null; topResults: string[]; appeared: boolean; results: any[] }> {
  const companyDomain = extractDomain(website)
  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) return { position: null, topResults: [], appeared: false, results: [] }

  const industryDesc = industry || query
  const prompt = `אני מחפש המלצות על ${industryDesc} בישראל. איזה עסקים או פלטפורמות היית ממליץ? רשום את 10 הטובים ביותר לפי סדר עדיפות. החזר JSON בלבד: [{"rank": 1, "name": "", "domain": "", "reason": ""}]`

  try {
    const t0 = Date.now()
    const res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    )
    if (!res.ok) {
      console.error('[GEO gemini] HTTP error:', res.status, await res.text())
      cost?.add({ provider: 'gemini', model: 'gemini-2.5-flash', ms: Date.now() - t0 })
      return { position: null, topResults: [], appeared: false, results: [] }
    }
    const data = await res.json()
    cost?.add({ provider: 'gemini', model: 'gemini-2.5-flash', data, ms: Date.now() - t0 })
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
      const tRetry = Date.now()
      const retryRes = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: retryPrompt }] }] }),
        }
      )
      if (retryRes.ok) {
        const retryData = await retryRes.json()
        cost?.add({ provider: 'gemini', model: 'gemini-2.5-flash', data: retryData, ms: Date.now() - tRetry })
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
  cost?: ScanCostCollector,
): Promise<{ position: number | null; topResults: string[]; appeared: boolean; results: any[] }> {
  if (engine === 'gemini') return runGeminiEngine(query, companyName, website, competitorNames, industry, cost)

  // OpenAI / ChatGPT engine — real Responses API + web_search.
  if (engine === 'openai') {
    const companyDomain = extractDomain(website)
    const rawResults = await fetchOpenAIGeoRaw(query, companyName, website, competitorNames, cost)
    return processResults(rawResults, companyName, companyDomain, competitorNames)
  }

  const prompt = buildEnginePrompt(engine, query, companyName, website, competitorNames)
  const companyDomain = extractDomain(website)

  const t0 = Date.now()
  let response: Response
  try {
    response = await fetchWithTimeout('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.XAI_API_KEY}` },
      body: JSON.stringify({
        model: 'grok-4-fast-non-reasoning',
        tools: [{ type: 'web_search' }],
        input: [{ role: 'user', content: prompt }],
      }),
    })
  } catch (err: any) {
    cost?.add({ provider: 'xai', model: 'grok-4-fast-non-reasoning', webSearch: true, ms: Date.now() - t0 })
    const why = err?.name === 'AbortError' ? `timeout_${GEO_ENGINE_TIMEOUT_MS}ms` : err?.message
    console.error(`[GEO ${engine}] Grok fetch failed: ${why}`)
    return { position: null, topResults: [], appeared: false, results: [] }
  }

  const data = await response.json().catch(() => ({}))
  cost?.add({ provider: 'xai', model: 'grok-4-fast-non-reasoning', webSearch: true, data, ms: Date.now() - t0 })
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

    // GEO no longer reuses SEO queries (that leaked short product terms) — it
    // sources natural-language questions from business_profile.geoQueries below.
    const { data: company } = await ctx.supabase
      .from('companies').select('geo_ranking').eq('id', ctx.user.id).single()

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

    // Cost instrumentation — one collector per route, flushed once at the end.
    const cost = new ScanCostCollector(ctx.user.id, 'geo_ranking')

    // ── Build query list ────────────────────────────────────────────────────
    // GEO checks AI-engine presence using NATURAL-LANGUAGE questions
    // (business_profile.geoQueries), NOT the short product terms in
    // company.keywords / SEO queryVariants. Source order:
    //   1. Stored business_profile.geoQueries (stable week-to-week for trends).
    //   2. Lazy-generate question-style queries ONCE via Gemini, then PERSIST
    //      them to business_profile.geoQueries so later scans reuse them (no
    //      regeneration cost, and the queries stay comparable over time).
    //   3. Single-query fallback (only when there's no profile to persist into).
    let queryList: string[] = []

    const storedGeoQueries = Array.isArray(businessProfile?.geoQueries)
      ? businessProfile!.geoQueries!.filter((q) => typeof q === 'string' && q.trim().length >= 3)
      : []
    if (storedGeoQueries.length > 0) {
      queryList = storedGeoQueries.slice(0, GEO_QUERY_LIMIT)
      console.log('[GEO] using stored geoQueries:', queryList)
    }

    // 2. Lazy-generate QUESTION-style geoQueries once, then persist to the profile.
    if (queryList.length === 0 && businessProfile) {
      const geminiKey = process.env.GEMINI_API_KEY
      if (geminiKey) {
        try {
          const coreDesc = businessProfile.coreActivity || overview.slice(0, 120)
          const productName = (businessProfile.products as any[])?.[0]?.name || ''
          const areaHint = isLocal && city ? ` באזור ${city}` : ' בישראל'
          const qPrompt = `העסק: ${coreDesc}${productName ? ` (מוצר עיקרי: ${productName})` : ''}.
צור 5 שאלות בשפה טבעית שלקוח ישראלי היה שואל את ChatGPT או Gemini כדי לקבל המלצה על עסק בתחום הזה${areaHint}.
שאלות מלאות ואמיתיות (לא מילות מפתח קצרות), בעברית. למשל: "מה חנות השטיחים הכי טובה במרכז?" או "המלצה על שטיחים איכותיים לסלון".
החזר JSON בלבד: [string, string, string, string, string]`
          const tq = Date.now()
          const qRes = await fetchWithTimeout(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contents: [{ parts: [{ text: qPrompt }] }] }),
            }
          )
          if (qRes.ok) {
            const qData = await qRes.json()
            cost.add({ provider: 'gemini', model: 'gemini-2.5-flash', data: qData, ms: Date.now() - tq })
            const qText = qData.candidates?.[0]?.content?.parts?.[0]?.text || ''
            const qClean = qText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
            const qs = qClean.indexOf('['); const qe = qClean.lastIndexOf(']')
            if (qs !== -1 && qe > qs) {
              const arr = JSON.parse(qClean.slice(qs, qe + 1))
              if (Array.isArray(arr)) {
                const generated = arr
                  .filter((q: any) => typeof q === 'string' && q.trim().length >= 3)
                  .map((q: string) => q.trim())
                  .slice(0, 5)
                if (generated.length > 0) {
                  // PERSIST once so future scans reuse the SAME stable questions.
                  const updatedProfile = { ...businessProfile, geoQueries: generated }
                  const { error: gqErr } = await ctx.supabase
                    .from('companies').update({ business_profile: updatedProfile }).eq('id', ctx.user.id)
                  if (gqErr) console.warn('[GEO] geoQueries persist error:', gqErr.message)
                  else console.log('[GEO] generated + persisted geoQueries:', generated)
                  queryList = generated.slice(0, GEO_QUERY_LIMIT)
                }
              }
            }
          }
        } catch (err) { console.error('[GEO] geoQueries generation error:', err) }
      }
    }

    // 3. Fallback: single query (no profile to persist into, or generation failed).
    if (queryList.length === 0) {
      const specificDesc = (businessProfile?.products as any[])?.[0]?.name || coreActivityDesc
      const generatedQuery = await buildSearchQuery(specificDesc, industry)
      const fallbackQuery = isLocal ? `${coreActivityDesc} ${scopeLocation}` : `${coreActivityDesc} ישראל`
      queryList = [generatedQuery || fallbackQuery]
    }

    const primaryQuery = queryList[0]
    const savedCompetitors: any[] = ctx.competitors || []
    const competitorNames = savedCompetitors.map((c: any) => c.name).filter(Boolean).slice(0, 10)

    // ── Run all queries × 3 REAL engines in parallel ────────────────────────
    // chatgpt field = real OpenAI (Responses API + web_search); gemini =
    // Google API; grok = xAI. No more fake 'chatgpt' routing to xAI.
    const queryVariantResults = await Promise.all(
      queryList.map(async (q) => {
        const [chatgptRes, geminiRes, grokRes] = await Promise.all([
          runGeoQuestion(q, companyName, website, competitorNames, 'openai', geminiIndustry, cost),
          runGeoQuestion(q, companyName, website, competitorNames, 'gemini', geminiIndustry, cost),
          runGeoQuestion(q, companyName, website, competitorNames, 'grok', undefined, cost),
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
      const tr = Date.now()
      const recsRes = await fetchWithTimeout('https://api.x.ai/v1/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.XAI_API_KEY}` },
        body: JSON.stringify({ model: 'grok-4-fast-non-reasoning', input: [{ role: 'user', content: recsPrompt }] }),
      })
      const recsData = await recsRes.json().catch(() => ({}))
      cost.add({ provider: 'xai', model: 'grok-4-fast-non-reasoning', data: recsData, ms: Date.now() - tr })
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
      await cost.flush()
      return NextResponse.json({ success: true, kept_existing: true, reason: guard.reason, existing_count: existingCount, new_count: newCount })
    }

    await ctx.supabase.from('companies').update({ geo_ranking: result }).eq('id', ctx.user.id)

    await cost.flush()
    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
