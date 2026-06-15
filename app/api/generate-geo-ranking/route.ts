export const dynamic = 'force-dynamic'

import { getFullContext } from '@/lib/context'
import { logKeptExisting } from '@/lib/scan/guard'
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
  try {
    const u = url.includes('://') ? url : `https://${url}`
    return new URL(u).hostname.replace(/^www\./, '')
  } catch { return (url || '').toLowerCase().replace(/^www\./, '').split('/')[0] }
}

// Normalize free text for fuzzy name comparison: lowercase, strip punctuation
// and common legal suffixes (Hebrew "בע"מ"/"ב.ש", Latin ltd/inc/llc), collapse
// whitespace.
function normalizeText(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/["'’`״׳.,()|\[\]{}<>!?:;/\\_=+*&^%$#@~-]+/g, ' ')
    .replace(/\b(בע"?מ|בעמ|בע״מ|ב\.?ש|ltd|inc|llc|co|company)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Compact form for token containment: normalized text with ALL whitespace
// removed, so "Buy Carpet" and "buycarpet" and "buycarpet.co.il" all collapse
// to a comparable token ("buycarpet"...).
function compactText(s: string): string {
  return normalizeText(s).replace(/\s+/g, '')
}

// Brand token from a domain: first label, letters/digits only.
// "buycarpet.co.il" → "buycarpet".
function brandTokenFromDomain(domain: string): string {
  const first = (domain || '').split('.')[0] || ''
  return first.replace(/[^a-z0-9֐-׿]/gi, '').toLowerCase()
}

interface ClientIdentity {
  domain: string          // buycarpet.co.il
  brandTokens: string[]   // compacted brand tokens (e.g. "buycarpet")
  names: string[]         // normalized full names/aliases for fuzzy contains
}

// Derive every identity the client may appear under in engine results:
// legal name, website domain + its brand token, explicit brandName, aliases.
function buildClientIdentity(companyName: string, website: string, bp: any): ClientIdentity {
  const domain = extractDomain(website).toLowerCase().trim()
  const explicitBrand = typeof bp?.brandName === 'string' ? bp.brandName.trim() : ''
  const aliases: string[] = Array.isArray(bp?.aliases)
    ? bp.aliases.filter((a: any) => typeof a === 'string' && a.trim()) : []
  const brandTokens = Array.from(new Set(
    [brandTokenFromDomain(domain), compactText(explicitBrand), ...aliases.map(compactText)]
      .filter((t) => t.length >= 3),
  ))
  const names = Array.from(new Set(
    [companyName, explicitBrand, ...aliases]
      .map(normalizeText)
      .filter((n) => n.length >= 4),
  ))
  return { domain, brandTokens, names }
}

// True if a result is the client, matched by domain OR brand token OR fuzzy name.
function isOwnResult(r: any, identity: ClientIdentity): boolean {
  const resultUrl = (r.url || '').toLowerCase().trim()
  const resultName = r.name || r.title || ''
  const nameNorm = normalizeText(resultName)
  const nameCompact = compactText(resultName)
  const urlCompact = compactText(resultUrl)
  // 1. Domain in result URL (most reliable).
  if (identity.domain.length >= 3 && resultUrl.includes(identity.domain)) return true
  // 2. Brand token contained in the result name or URL text
  //    ("BuyCarpet", "Buy Carpet", "buycarpet.co.il" all contain "buycarpet").
  for (const tok of identity.brandTokens) {
    if (tok.length >= 3 && (nameCompact.includes(tok) || urlCompact.includes(tok))) return true
  }
  // 3. Fuzzy name: normalized containment in either direction.
  if (nameNorm.length >= 3) {
    for (const nm of identity.names) {
      if (nm.length >= 4 && (nameNorm.includes(nm) || nm.includes(nameNorm))) return true
    }
  }
  return false
}

const CACHE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

// Total result rows captured across ALL engines × ALL queries in a geo_ranking
// object. Used by the write guard so one empty engine can't make the whole
// scan look "empty". Falls back to the legacy single `results` array.
function totalEngineResults(geo: any): number {
  const qr = geo?.queryResults
  if (qr && typeof qr === 'object') {
    return Object.values(qr).reduce((sum: number, eng: any) =>
      sum +
      (Array.isArray(eng?.chatgpt?.results) ? eng.chatgpt.results.length : 0) +
      (Array.isArray(eng?.gemini?.results) ? eng.gemini.results.length : 0) +
      (Array.isArray(eng?.grok?.results) ? eng.grok.results.length : 0), 0)
  }
  return Array.isArray(geo?.results) ? geo.results.length : 0
}

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
  identity: ClientIdentity,
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
    const own = isOwnResult(r, identity)
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
  identity: ClientIdentity,
  industry?: string,
  cost?: ScanCostCollector,
): Promise<{ position: number | null; topResults: string[]; appeared: boolean; results: any[] }> {
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
    return processResults(rawResults, identity, competitorNames)
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
  identity: ClientIdentity,
  engine: Engine = 'general',
  industry?: string,
  cost?: ScanCostCollector,
): Promise<{ position: number | null; topResults: string[]; appeared: boolean; results: any[] }> {
  if (engine === 'gemini') return runGeminiEngine(query, companyName, website, competitorNames, identity, industry, cost)

  // OpenAI / ChatGPT engine — real Responses API + web_search.
  if (engine === 'openai') {
    const rawResults = await fetchOpenAIGeoRaw(query, companyName, website, competitorNames, cost)
    return processResults(rawResults, identity, competitorNames)
  }

  const prompt = buildEnginePrompt(engine, query, companyName, website, competitorNames)

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
  return processResults(rawResults, identity, competitorNames)
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

    // Identity used to MATCH the client inside engine results (brand/domain/
    // alias aware), and a brand-aware label injected into the engine prompts so
    // the engines also detect the client under its real brand (e.g. "BuyCarpet"
    // / buycarpet.co.il), not just its legal name ("שטיחים בסנטר ב.ש בע"מ").
    const clientIdentity = buildClientIdentity(companyName, website, businessProfile)
    const derivedBrand = (businessProfile?.brandName && businessProfile.brandName.trim())
      ? businessProfile.brandName.trim()
      : extractDomain(website)
    const companyLabel = (derivedBrand && !companyName.toLowerCase().includes(derivedBrand.toLowerCase()))
      ? `${companyName} (ידוע גם כ-"${derivedBrand}")`
      : companyName

    // Cost instrumentation — one collector per route, flushed once at the end.
    const cost = new ScanCostCollector(ctx.user.id, 'geo_ranking')

    // ── Build query list ────────────────────────────────────────────────────
    // GEO checks AI-engine presence using NATURAL-LANGUAGE questions
    // (business_profile.geoQueries), NOT the short product terms in
    // company.keywords / SEO queryVariants. We keep EXACTLY GEO_QUERY_LIMIT (3)
    // questions stored. Source order:
    //   1. Stored business_profile.geoQueries (stable week-to-week for trends).
    //      - More than the limit (legacy 5-query clients) → trim to 3 + persist.
    //      - Fewer than the limit (client deleted some) → TOP UP with NEW
    //        questions to refill to 3, then persist.
    //   2. No stored queries → generate a full set of 3 + persist.
    //   3. Single-query fallback (only when there's no profile to persist into).
    let queryList: string[] = []

    // Generate up to `count` NEW short natural-language questions, avoiding any
    // in `existing`. Returns [] on any failure (caller handles fallback).
    const generateGeoQuestions = async (count: number, existing: string[]): Promise<string[]> => {
      const geminiKey = process.env.GEMINI_API_KEY
      if (!geminiKey || !businessProfile || count <= 0) return []
      try {
        const coreDesc = businessProfile.coreActivity || overview.slice(0, 120)
        const productName = (businessProfile.products as any[])?.[0]?.name || ''
        const areaHint = isLocal && city ? ` באזור ${city}` : ' בישראל'
        const avoidHint = existing.length > 0
          ? `\nאל תחזור על השאלות הקיימות הבאות (צור שאלות שונות): ${existing.map((q) => `"${q}"`).join(', ')}.`
          : ''
        const qPrompt = `העסק: ${coreDesc}${productName ? ` (מוצר עיקרי: ${productName})` : ''}.
צור בדיוק ${count} שאלות קצרות וטבעיות שלקוח ישראלי היה מקליד ב-ChatGPT או Gemini כדי לקבל המלצה על עסק בתחום הזה${areaHint}.
כל שאלה: 6-12 מילים, כוונה אחת ברורה בלבד, בלי ערימת תנאים. בעברית, שאלות אמיתיות (לא מילות מפתח).
למשל: "איפה כדאי לקנות שטיח לסלון בישראל?", "מה חנות השטיחים הכי טובה במרכז?", "המלצה על חנות שטיחים אונליין בישראל".${avoidHint}
החזר JSON בלבד: מערך של ${count} מחרוזות.`
        const tq = Date.now()
        const qRes = await fetchWithTimeout(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: qPrompt }] }] }),
          }
        )
        if (!qRes.ok) return []
        const qData = await qRes.json()
        cost.add({ provider: 'gemini', model: 'gemini-2.5-flash', data: qData, ms: Date.now() - tq })
        const qText = qData.candidates?.[0]?.content?.parts?.[0]?.text || ''
        const qClean = qText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
        const qs = qClean.indexOf('['); const qe = qClean.lastIndexOf(']')
        if (qs === -1 || qe <= qs) return []
        const arr = JSON.parse(qClean.slice(qs, qe + 1))
        if (!Array.isArray(arr)) return []
        const existingLower = new Set(existing.map((q) => q.trim().toLowerCase()))
        return arr
          .filter((q: any) => typeof q === 'string' && q.trim().length >= 3)
          .map((q: string) => q.trim())
          .filter((q: string) => !existingLower.has(q.toLowerCase()))
          .slice(0, count)
      } catch (err) {
        console.error('[GEO] geoQueries generation error:', err)
        return []
      }
    }

    // Persist the final geoQueries set back to the profile (best-effort).
    const persistGeoQueries = async (queries: string[]) => {
      if (!businessProfile) return
      const updatedProfile = { ...businessProfile, geoQueries: queries }
      const { error: gqErr } = await ctx.supabase
        .from('companies').update({ business_profile: updatedProfile }).eq('id', ctx.user.id)
      if (gqErr) console.warn('[GEO] geoQueries persist error:', gqErr.message)
      else console.log('[GEO] persisted geoQueries:', queries)
    }

    const storedGeoQueries = Array.isArray(businessProfile?.geoQueries)
      ? businessProfile!.geoQueries!.filter((q) => typeof q === 'string' && q.trim().length >= 3)
      : []

    if (storedGeoQueries.length >= GEO_QUERY_LIMIT) {
      // Enough stored. Trim legacy over-limit sets (e.g. 5 → 3) and persist the trim.
      queryList = storedGeoQueries.slice(0, GEO_QUERY_LIMIT)
      if (storedGeoQueries.length > GEO_QUERY_LIMIT) {
        await persistGeoQueries(queryList)
        console.log('[GEO] trimmed stored geoQueries to limit:', queryList)
      } else {
        console.log('[GEO] using stored geoQueries:', queryList)
      }
    } else if (storedGeoQueries.length > 0) {
      // Client deleted some — TOP UP with NEW questions to refill back to the limit.
      const need = GEO_QUERY_LIMIT - storedGeoQueries.length
      const fresh = await generateGeoQuestions(need, storedGeoQueries)
      queryList = [...storedGeoQueries, ...fresh].slice(0, GEO_QUERY_LIMIT)
      if (fresh.length > 0) await persistGeoQueries(queryList)
      console.log('[GEO] topped up geoQueries to limit:', queryList)
    } else if (businessProfile) {
      // No stored queries — generate a full set once and persist.
      const fresh = await generateGeoQuestions(GEO_QUERY_LIMIT, [])
      if (fresh.length > 0) {
        queryList = fresh.slice(0, GEO_QUERY_LIMIT)
        await persistGeoQueries(queryList)
        console.log('[GEO] generated + persisted geoQueries:', queryList)
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
          runGeoQuestion(q, companyLabel, website, competitorNames, clientIdentity, 'openai', geminiIndustry, cost),
          runGeoQuestion(q, companyLabel, website, competitorNames, clientIdentity, 'gemini', geminiIndustry, cost),
          runGeoQuestion(q, companyLabel, website, competitorNames, clientIdentity, 'grok', undefined, cost),
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

    // Guard: only keep the OLD ranking if the new scan returned NOTHING across
    // EVERY engine AND EVERY query. A single empty engine (e.g. ChatGPT parse
    // failure) must NOT discard the Gemini/Grok lists or freeze the queries —
    // so we count results across all engines × all queries, not just
    // primary.chatgpt. Any non-zero total → the write proceeds.
    const { data: prevGeo } = await ctx.supabase
      .from('companies').select('geo_ranking').eq('id', ctx.user.id).single()
    const existingCount = totalEngineResults(prevGeo?.geo_ranking)
    const newCount = totalEngineResults(result)

    if (existingCount > 0 && newCount === 0) {
      await logKeptExisting(ctx.supabase, ctx.user.id, { module: 'geo_ranking', reason: 'empty', existing_count: existingCount, new_count: newCount })
      await cost.flush()
      return NextResponse.json({ success: true, kept_existing: true, reason: 'empty', existing_count: existingCount, new_count: newCount })
    }

    await ctx.supabase.from('companies').update({ geo_ranking: result }).eq('id', ctx.user.id)

    await cost.flush()
    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
