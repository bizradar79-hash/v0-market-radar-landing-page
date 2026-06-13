export const dynamic = 'force-dynamic'

import { getFullContext } from '@/lib/context'
import { ScanCostCollector } from '@/lib/scan/cost-tracker'
import {
  fetchSearchVolume, fetchKeywordSuggestions,
  type SearchVolumeEntry, type KeywordSuggestion, type Competition,
} from '@/lib/seo/dataforseo'
import { NextResponse } from 'next/server'
import type { BusinessProfile } from '@/types/business-profile'

export const maxDuration = 60

const CACHE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const MAX_KEYWORDS = 8

// Default to REAL Google Ads search volume via DataForSEO. Set
// KEYWORD_TRENDS_PROVIDER=grok to force the legacy AI-guess fallback path.
const PROVIDER = (process.env.KEYWORD_TRENDS_PROVIDER || 'dataforseo').toLowerCase()

// ── Stored shape (new keyword-intelligence model) ────────────────────────────
// Each keyword maps to ONE actionable record built from absolute Google Ads
// numbers — NOT a relative 0-100 Trends graph. The trends UI reads these fields
// directly (volume headline, real %, CPC/competition, 12-mo sparkline, related
// long-tails, and a template-generated Hebrew insight line).
type Direction = 'rising' | 'falling' | 'stable'
const DIRECTION_HE: Record<Direction, string> = { rising: 'עולה', falling: 'יורד', stable: 'יציב' }
const COMPETITION_HE: Record<Competition, string> = {
  LOW: 'נמוכה', MEDIUM: 'בינונית', HIGH: 'גבוהה', UNKNOWN: '—',
}

const LOW_VOLUME = 30
const HIGH_VOLUME = 500

interface StoredRelated { keyword: string; searchVolume: number; cpc?: number }
interface StoredKeyword {
  keyword: string
  searchVolume: number
  avgVolume12mo: number
  changePct: number
  direction: Direction
  directionHe: string
  cpc: number
  competition: Competition
  competitionHe: string
  competitionIndex: number
  lowData: boolean
  monthlySeries: number[]        // chronological, for the sparkline
  related: StoredRelated[]
  insight: string
  fetchedAt: string
  provider: 'dataforseo' | 'grok'
}

/** Template-based Hebrew insight (NO AI) — pure logic from the numbers. */
function buildInsight(e: { keyword: string; searchVolume: number; changePct: number; direction: Direction; lowData: boolean }): string {
  const kw = e.keyword
  const v = e.searchVolume
  const fmt = v.toLocaleString('he-IL')
  const sign = e.changePct > 0 ? '+' : ''
  if (v < LOW_VOLUME) {
    return `ℹ️ '${kw}' נפח חיפוש נמוך (${fmt}/חודש) — נישה ממוקדת.`
  }
  if (e.direction === 'rising' && !e.lowData) {
    return `📈 '${kw}' בעלייה (${sign}${e.changePct}%) עם ${fmt} חיפושים בחודש — שווה להגביר נוכחות.`
  }
  if (e.direction === 'falling' && !e.lowData) {
    return `📉 '${kw}' בירידה (${e.changePct}%) — ייתכן שהביקוש נחלש.`
  }
  if (v >= HIGH_VOLUME) {
    return `➡️ '${kw}' יציב עם ביקוש גבוה (${fmt}/חודש) — בסיס קבוע.`
  }
  return `➡️ '${kw}' יציב עם ${fmt} חיפושים בחודש.`
}

function volumeToStored(e: SearchVolumeEntry, suggestions: KeywordSuggestion[]): StoredKeyword {
  return {
    keyword: e.keyword,
    searchVolume: e.searchVolume,
    avgVolume12mo: e.avgVolume12mo,
    changePct: e.changePct,
    direction: e.direction,
    directionHe: DIRECTION_HE[e.direction],
    cpc: Math.round(e.cpc * 100) / 100,
    competition: e.competition,
    competitionHe: COMPETITION_HE[e.competition],
    competitionIndex: e.competitionIndex,
    lowData: e.lowData,
    monthlySeries: e.monthlySearches.map(m => m.searchVolume),
    related: suggestions.map(s => ({ keyword: s.keyword, searchVolume: s.searchVolume, cpc: Math.round(s.cpc * 100) / 100 })),
    insight: buildInsight(e),
    fetchedAt: new Date().toISOString(),
    provider: 'dataforseo',
  }
}

// ── Legacy Grok fallback (used only when DataForSEO fails) ────────────────────
// Produces a degraded record in the SAME stored shape: no real volume, direction
// from Gemini's guess, related from Gemini's related_queries. The UI shows it
// with volume omitted rather than a relative graph.
async function fetchViaGrokFallback(keyword: string, cost: ScanCostCollector): Promise<StoredKeyword | null> {
  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) return null
  const prompt = `בהתבסס על ידע שלך, מה הטרנד של מילת המפתח "${keyword}" בישראל? עולה (rising), יורד (falling) או יציב (stable)? ומה 3 ביטויי החיפוש הקשורים הפופולריים לה? החזר JSON: {"trend": "rising", "related_queries": ["", "", ""]}`
  const t0 = Date.now()
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) },
    )
    const data = await res.json()
    cost.add({ provider: 'gemini', model: 'gemini-2.5-flash', data, ms: Date.now() - t0 })
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    const s = clean.indexOf('{'); const e = clean.lastIndexOf('}')
    if (s === -1 || e <= s) return null
    const parsed = JSON.parse(clean.slice(s, e + 1))
    const dir: Direction = parsed.trend === 'rising' || parsed.trend === 'falling' ? parsed.trend : 'stable'
    const related: StoredRelated[] = (Array.isArray(parsed.related_queries) ? parsed.related_queries : [])
      .slice(0, 3).map((q: any) => ({ keyword: String(q), searchVolume: 0 }))
    return {
      keyword,
      searchVolume: 0,
      avgVolume12mo: 0,
      changePct: 0,
      direction: dir,
      directionHe: DIRECTION_HE[dir],
      cpc: 0,
      competition: 'UNKNOWN',
      competitionHe: COMPETITION_HE.UNKNOWN,
      competitionIndex: 0,
      lowData: true,
      monthlySeries: [],
      related,
      insight: `ℹ️ '${keyword}' — הערכת מגמה (${DIRECTION_HE[dir]}) ללא נתוני נפח חיפוש.`,
      fetchedAt: new Date().toISOString(),
      provider: 'grok',
    }
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  let cost: ScanCostCollector | null = null
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    cost = new ScanCostCollector(ctx.user.id, 'keyword_trends')

    const forceQuery = new URL(request.url).searchParams.get('force') === 'true'
    const body = await request.json().catch(() => ({}))
    const force = forceQuery || body.force === true

    // Accept a single `keyword` (UI refresh) or `keywords[]` (orchestrator batch).
    const rawKeywords: string[] = Array.isArray(body.keywords)
      ? body.keywords
      : (body.keyword ? [body.keyword] : [])
    const keywords = [...new Set(rawKeywords.map((k: string) => (k || '').trim()).filter(Boolean))].slice(0, MAX_KEYWORDS)
    const singleKeyword = keywords.length === 1 ? keywords[0] : null

    const businessProfile = (ctx.company?.business_profile ?? null) as BusinessProfile | null

    if (keywords.length === 0) {
      const companyKeywords: string[] = ctx.company?.keywords || []
      const suggestedKeywords = businessProfile?.primaryKeywords?.filter(
        k => !companyKeywords.includes(k)
      ).slice(0, 10) || []
      await cost.flush()
      return NextResponse.json({ error: 'Missing keyword', suggested_keywords: suggestedKeywords }, { status: 400 })
    }

    // Per-keyword cache (single, non-forced refresh only).
    if (singleKeyword && !force) {
      const { data: company } = await ctx.supabase
        .from('companies').select('keyword_trends').eq('id', ctx.user.id).single()
      const existing = company?.keyword_trends as Record<string, any> | null
      const kwData = existing?.[singleKeyword] as StoredKeyword | undefined
      if (kwData?.fetchedAt) {
        const age = Date.now() - new Date(kwData.fetchedAt).getTime()
        if (age < CACHE_MS) {
          await cost.flush()
          return NextResponse.json({ success: true, keyword: singleKeyword, cached: true, data: kwData })
        }
      }
    }

    // ── Build a stored record per keyword ────────────────────────────────────
    // Default: ONE Google Ads search-volume call for ALL keywords + one keyword-
    // suggestions call per keyword. Fall back to the Grok/Gemini guess only if
    // DataForSEO fails (or KEYWORD_TRENDS_PROVIDER=grok).
    const built: Record<string, StoredKeyword> = {}

    if (PROVIDER === 'dataforseo') {
      const t0 = Date.now()
      const vol = await fetchSearchVolume(keywords)
      cost.add({ provider: 'dataforseo', model: 'google_ads_search_volume', webSearch: true, ms: Date.now() - t0 })

      if (vol.ok && vol.keywords.length > 0) {
        // Real long-tail suggestions — one Labs call per keyword, in parallel.
        const suggByKw = new Map<string, KeywordSuggestion[]>()
        await Promise.all(keywords.map(async (kw) => {
          const st0 = Date.now()
          const sg = await fetchKeywordSuggestions(kw, { limit: 3 })
          cost!.add({ provider: 'dataforseo', model: 'keyword_suggestions', webSearch: true, ms: Date.now() - st0 })
          suggByKw.set(kw, sg.ok ? sg.suggestions : [])
        }))

        for (const kw of keywords) {
          const match = vol.keywords.find(k => k.keyword?.toLowerCase() === kw.toLowerCase()) ?? null
          if (match) built[kw] = volumeToStored(match, suggByKw.get(kw) ?? [])
        }
        console.log(`[keyword_trends] DataForSEO Google Ads: ${Object.keys(built).length}/${keywords.length} keywords with real volume`)
      } else {
        console.warn(`[keyword_trends] DataForSEO failed (${vol.error ?? 'no_data'}) — falling back to Grok/Gemini`)
        await Promise.all(keywords.map(async (kw) => {
          const stored = await fetchViaGrokFallback(kw, cost!)
          if (stored) built[kw] = stored
        }))
      }
    } else {
      await Promise.all(keywords.map(async (kw) => {
        const stored = await fetchViaGrokFallback(kw, cost!)
        if (stored) built[kw] = stored
      }))
    }

    // ── Merge with existing, keep-existing guard per keyword ──────────────────
    const { data: company } = await ctx.supabase
      .from('companies').select('keyword_trends').eq('id', ctx.user.id).single()
    const existing = (company?.keyword_trends && typeof company.keyword_trends === 'object')
      ? { ...(company.keyword_trends as Record<string, any>) }
      : {} as Record<string, any>

    let updatedCount = 0
    for (const kw of keywords) {
      const fresh = built[kw]
      if (fresh) {
        existing[kw] = fresh
        updatedCount++
      } else if (existing[kw]) {
        console.log(`[keyword_trends] "${kw}" returned empty — keeping existing record`)
      }
    }

    const { error: saveError } = await ctx.supabase
      .from('companies').update({ keyword_trends: existing }).eq('id', ctx.user.id)
    if (saveError) console.error('keyword_trends save error:', saveError.code, saveError.message)

    await cost.flush()

    if (singleKeyword) {
      return NextResponse.json({
        success: true, keyword: singleKeyword, updated: updatedCount,
        data: existing[singleKeyword] ?? null,
        ...(saveError ? { saveError: saveError.message } : {}),
      })
    }

    return NextResponse.json({
      success: true, updated: updatedCount, total: keywords.length, keywords,
      ...(saveError ? { saveError: saveError.message } : {}),
    })
  } catch (e: any) {
    await cost?.flush()
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
