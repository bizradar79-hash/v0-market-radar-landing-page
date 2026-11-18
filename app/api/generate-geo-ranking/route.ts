export const dynamic = 'force-dynamic'

import { getFullContext } from '@/lib/context'
import { deriveArea } from '@/lib/geo/area'
import { logKeptExisting } from '@/lib/scan/guard'
import { askEngine, parseRankedAnswer, type GeoEngineId } from '@/lib/geo/dataforseo-llm'
import { buildClientIdentity, isOwnGeoResult, type ClientIdentity } from '@/lib/geo/identity'
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

// (identity + own-result matching moved to lib/geo/identity — shared with the
// GEO reader/reconciliation and the app GEO page so they can't drift.)


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
      (Array.isArray(eng?.claude?.results) ? eng.claude.results.length : 0) +
      // legacy rows stored before the move to DataForSEO
      (Array.isArray(eng?.grok?.results) ? eng.grok.results.length : 0), 0)
  }
  return Array.isArray(geo?.results) ? geo.results.length : 0
}

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
    const own = isOwnGeoResult(r, identity)
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
    const industry = ctx.company?.industry || ''
    const overview = ctx.company?.business_overview || ctx.company?.description || ''

    // Single source of truth (geographic_scope) — no more raw city/geo_area guards.
    const areaInfo = deriveArea(ctx.company, ctx.company?.business_profile)
    const isLocal = areaInfo.isLocal
    const isInternational = areaInfo.isInternational
    const scopeLocation = isLocal ? areaInfo.display : isInternational ? 'ישראל ועולם' : 'ישראל'
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
        const areaHint = isLocal ? ` באזור ${areaInfo.display}` : ' בישראל'
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

    const rawStoredGeoQueries = Array.isArray(businessProfile?.geoQueries)
      ? businessProfile!.geoQueries!.filter((q) => typeof q === 'string' && q.trim().length >= 3)
      : []

    // ONE-TIME NORMALIZATION: drop legacy LONG paragraph queries (> 15 words).
    // They hurt engine latency (ChatGPT browsing) and aren't real user phrasing.
    // Dropped slots are refilled below with NEW short questions and persisted, so
    // the stored set is permanently migrated to the short form on the next scan.
    const MAX_GEO_QUERY_WORDS = 15
    const wordCount = (q: string) => q.trim().split(/\s+/).filter(Boolean).length
    const storedGeoQueries = rawStoredGeoQueries.filter((q) => wordCount(q) <= MAX_GEO_QUERY_WORDS)
    const droppedLong = rawStoredGeoQueries.length - storedGeoQueries.length
    if (droppedLong > 0) console.log(`[GEO] dropping ${droppedLong} long (>${MAX_GEO_QUERY_WORDS}-word) stored quer${droppedLong === 1 ? 'y' : 'ies'} for regeneration`)

    if (storedGeoQueries.length >= GEO_QUERY_LIMIT) {
      // Enough SHORT stored. Trim to limit; persist if we trimmed or dropped longs.
      queryList = storedGeoQueries.slice(0, GEO_QUERY_LIMIT)
      if (storedGeoQueries.length > GEO_QUERY_LIMIT || droppedLong > 0) {
        await persistGeoQueries(queryList)
        console.log('[GEO] normalized stored geoQueries:', queryList)
      } else {
        console.log('[GEO] using stored geoQueries:', queryList)
      }
    } else if (storedGeoQueries.length > 0) {
      // Deleted and/or long ones dropped — TOP UP with NEW SHORT questions.
      const need = GEO_QUERY_LIMIT - storedGeoQueries.length
      const fresh = await generateGeoQuestions(need, storedGeoQueries)
      queryList = [...storedGeoQueries, ...fresh].slice(0, GEO_QUERY_LIMIT)
      if (fresh.length > 0 || droppedLong > 0) await persistGeoQueries(queryList)
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

    // ── Run all queries × 3 engines via DataForSEO LLM Responses ────────────
    // ChatGPT / Gemini / Claude through ONE schema (lib/geo/dataforseo-llm),
    // web search on, Hebrew. Grok and the direct OpenAI/Gemini engine calls are
    // gone from GEO. Each answer's numbered recommendation list is parsed and
    // the client is detected with the shared identity matcher (processResults →
    // isOwnGeoResult), so stored cells keep the SAME shape the report/page read.
    const ENGINE_IDS: GeoEngineId[] = ['chatgpt', 'gemini', 'claude']
    const EMPTY_ENGINE = { position: null, topResults: [] as string[], appeared: false, results: [] as any[] }
    const runEngine = async (engine: GeoEngineId, q: string) => {
      const t0 = Date.now()
      const ans = await askEngine(engine, q)
      cost.add({ provider: 'dataforseo', model: `llm_responses:${engine}:${ans.model}`, costUSD: ans.costUSD, ms: Date.now() - t0 })
      if (!ans.ok) {
        console.error(`[GEO ${engine}] DataForSEO error:`, ans.error)
        return { ...EMPTY_ENGINE, error: ans.error }
      }
      const parsed = parseRankedAnswer(ans.text)
      console.log(`[GEO ${engine}] ${ans.model}: parsed ${parsed.length} recommendations`)
      return { ...processResults(parsed, clientIdentity, competitorNames), model: ans.model }
    }
    const queryVariantResults = await Promise.all(
      queryList.map(async (q) => {
        const cells = await Promise.all(ENGINE_IDS.map((e) => runEngine(e, q).catch(() => EMPTY_ENGINE)))
        return { query: q, chatgpt: cells[0], gemini: cells[1], claude: cells[2] }
      })
    )

    // Build queryResults map: query → { chatgpt, gemini, claude }
    const queryResults: Record<string, any> = {}
    for (const qr of queryVariantResults) {
      queryResults[qr.query] = { chatgpt: qr.chatgpt, gemini: qr.gemini, claude: qr.claude }
    }

    // Primary engines (first query) for backward compat
    const primary = queryVariantResults[0]
    const engines = { chatgpt: primary.chatgpt, gemini: primary.gemini, claude: primary.claude }

    console.log('[GEO] queries:', queryList.length, JSON.stringify(
      queryVariantResults.map(qr => ({
        query: qr.query.slice(0, 30),
        chatgpt: qr.chatgpt.results.length,
        gemini: qr.gemini.results.length,
        claude: qr.claude.results.length,
      }))
    ))

    // Recommendations — one short call through the same DataForSEO schema
    // (ChatGPT, no web search ≈ a fraction of a cent). No Grok.
    let recommendations: string[] = []
    try {
      const t0 = Date.now()
      const rec = await askEngine('chatgpt', `כתוב 3 המלצות ספציפיות כיצד ${companyName} (${industry || coreActivityDesc}) יכול לשפר את הנוכחות שלו במנועי AI כמו ChatGPT, Gemini ו-Claude כשמחפשים "${primaryQuery}".`, {
        webSearch: false, maxTokens: 1200, // reasoning models reject < 1024
        systemMessage: 'ענה בעברית. החזר JSON בלבד בפורמט {"recommendations": ["", "", ""]} — בלי markdown.',
      })
      cost.add({ provider: 'dataforseo', model: `llm_responses:chatgpt:${rec.model}`, costUSD: rec.costUSD, ms: Date.now() - t0 })
      const clean = rec.text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
      const rs = clean.indexOf('{'); const re = clean.lastIndexOf('}')
      if (rs !== -1 && re > rs) {
        try {
          const parsed = JSON.parse(clean.slice(rs, re + 1))
          recommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations.filter((r: any) => typeof r === 'string').slice(0, 3) : []
        } catch { /* fall through to the list parse */ }
      }
      // Models often answer as a list despite the JSON instruction — take the items.
      if (recommendations.length === 0 && rec.text) {
        recommendations = rec.text.split('\n')
          .map((l) => l.trim().match(/^(?:\d{1,2}[.)]|[-•*])\s+(.+)$/)?.[1]?.replace(/\*\*/g, '').trim() || '')
          .filter((l) => l.length > 10)
          .slice(0, 3)
      }
      if (recommendations.length === 0) console.warn('[GEO] recommendations unparsed:', rec.ok ? rec.text.slice(0, 300) : rec.error)
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
    // Cost of THIS run (the breakdown only persists during a full scan).
    return NextResponse.json({ success: true, ...result, cost: cost.summary() })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
