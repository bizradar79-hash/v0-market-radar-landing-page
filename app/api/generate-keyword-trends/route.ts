export const dynamic = 'force-dynamic'

import { getFullContext } from '@/lib/context'
import { ScanCostCollector } from '@/lib/scan/cost-tracker'
import { fetchGoogleTrends, type KeywordTrend } from '@/lib/seo/dataforseo'
import { NextResponse } from 'next/server'
import type { BusinessProfile } from '@/types/business-profile'

export const maxDuration = 60

const CACHE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

// Default to REAL Google Trends via DataForSEO. Set KEYWORD_TRENDS_PROVIDER=grok
// to force the legacy AI-guess path (kept as a fallback when DataForSEO fails).
const PROVIDER = (process.env.KEYWORD_TRENDS_PROVIDER || 'dataforseo').toLowerCase()

// ── Stored shape ─────────────────────────────────────────────────────────────
// The trends UI renders one row per item in `israel` with { phrase, trend(Hebrew),
// reason, trend_data:[{week,value}] }. DataForSEO produces exactly one row per
// keyword (its own 12-month interest series), so each keyword card shows a single
// trend + sparkline of real Google Trends data.
const TREND_HE: Record<KeywordTrend['trend'], string> = {
  rising: 'עולה', falling: 'יורד', stable: 'יציב',
}

function trendToStored(kt: KeywordTrend) {
  const trend_data = kt.series
    .filter(p => typeof p.value === 'number')
    .map(p => ({ week: p.date, value: p.value as number }))
  const sign = kt.changePct > 0 ? '+' : ''
  const israel = [{
    phrase: kt.keyword,
    trend: TREND_HE[kt.trend],
    reason: `${sign}${kt.changePct}% ב-12 החודשים האחרונים (Google Trends)`,
    trend_data,
  }]
  return {
    fetchedAt: new Date().toISOString(),
    trends: israel,       // backward-compat alias
    israel,
    world: [],
    related_queries: [],
    gemini_trend: kt.trend, // english rising/falling/stable
    gemini_confidence: null,
    provider: 'dataforseo' as const,
    changePct: kt.changePct,
  }
}

// ── Legacy Grok/Gemini path (fallback only) ──────────────────────────────────
async function fetchTrendsForRegion(keyword: string, region: 'israel' | 'world', cost: ScanCostCollector, geoContext?: string): Promise<any[]> {
  const geoText = region === 'israel'
    ? `בישראל. חפש מה אנשים מחפשים יותר בגוגל, מה עולה ברשתות חברתיות, מה מדוברים בפורומים ישראליים`
    : `בעולם (לא מוגבל לישראל). חפש מגמות גלובליות בגוגל, רשתות חברתיות, ופורומים בינלאומיים`

  const prompt = `מצא את 5 הנושאים והביטויים שהיו הכי טרנדיים בשבוע האחרון וקשורים למילה: '${keyword}' ${geoText}.${geoContext ? `\nהקשר עסקי: ${geoContext}` : ''}

גם תן לכל ביטוי 4 נקודות נתונים שבועיות (ערך 0-100 עוצמה) עבור 4 השבועות האחרונים מהישן לחדש.

החזר JSON בלבד:
[{"phrase": "", "trend": "עולה/יורד/יציב", "reason": "למה זה טרנדי עכשיו", "trend_data": [{"week": "W1", "value": 40}, {"week": "W2", "value": 55}, {"week": "W3", "value": 70}, {"week": "W4", "value": 85}]}]

CRITICAL: Output ONLY a raw JSON array. No markdown. Start with [ and end with ]`

  const t0 = Date.now()
  let response: Response
  try {
    response = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'grok-4-fast-non-reasoning',
        input: [{ role: 'user', content: prompt }],
        tools: [{ type: 'web_search' }],
      }),
    })
  } catch (err: any) {
    cost.add({ provider: 'xai', model: 'grok-4-fast-non-reasoning', webSearch: true, ms: Date.now() - t0 })
    console.error(`[keyword-trends ${region}] xAI fetch failed:`, err?.message)
    return []
  }

  let data: any
  try {
    data = await response.json()
  } catch (err: any) {
    cost.add({ provider: 'xai', model: 'grok-4-fast-non-reasoning', webSearch: true, ms: Date.now() - t0 })
    console.error(`[keyword-trends ${region}] non-JSON xAI body (status ${response.status}):`, err?.message)
    return []
  }
  cost.add({ provider: 'xai', model: 'grok-4-fast-non-reasoning', webSearch: true, data, ms: Date.now() - t0 })
  if (!response.ok || !data.output) return []

  const text = data.output
    .filter((item: any) => item.type === 'message')
    .flatMap((item: any) => item.content)
    .filter((c: any) => c.type === 'output_text')
    .map((c: any) => c.text)
    .join('')

  const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
  const start = clean.indexOf('[')
  const end = clean.lastIndexOf(']')
  if (start === -1 || end <= start) return []

  try {
    const list = JSON.parse(clean.slice(start, end + 1))
    return Array.isArray(list) ? list.slice(0, 5) : []
  } catch {
    return []
  }
}

async function fetchRelatedQueriesFromGemini(keyword: string, cost: ScanCostCollector): Promise<{
  trend: string; related_queries: string[]; confidence: number
} | null> {
  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) return null
  const prompt = `בהתבסס על ידע שלך על גוגל טרנדס, מה הטרנד של מילת המפתח "${keyword}" בישראל בשבועות האחרונים? עולה, יורד או יציב? ומה 5 ביטויי החיפוש הקשורים הכי פופולריים לה כרגע? החזר JSON: {"trend": "rising", "related_queries": ["", "", "", "", ""], "confidence": 80}`
  const t0 = Date.now()
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    )
    const data = await res.json()
    cost.add({ provider: 'gemini', model: 'gemini-2.5-flash', data, ms: Date.now() - t0 })
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    const s = clean.indexOf('{'); const e = clean.lastIndexOf('}')
    if (s === -1 || e <= s) return null
    const parsed = JSON.parse(clean.slice(s, e + 1))
    return {
      trend: parsed.trend || 'stable',
      related_queries: Array.isArray(parsed.related_queries) ? parsed.related_queries.slice(0, 5) : [],
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 70,
    }
  } catch { return null }
}

/** Legacy per-keyword Grok+Gemini path. Returns the stored object or null. */
async function fetchViaGrok(keyword: string, cost: ScanCostCollector, geoContext?: string) {
  const [israelTrends, worldTrends, geminiData] = await Promise.all([
    fetchTrendsForRegion(keyword, 'israel', cost, geoContext),
    fetchTrendsForRegion(keyword, 'world', cost, geoContext),
    fetchRelatedQueriesFromGemini(keyword, cost),
  ])
  const count = (israelTrends?.length ?? 0) + (worldTrends?.length ?? 0)
  if (count === 0) return null
  return {
    fetchedAt: new Date().toISOString(),
    trends: israelTrends,
    israel: israelTrends,
    world: worldTrends,
    related_queries: geminiData?.related_queries ?? [],
    gemini_trend: geminiData?.trend ?? null,
    gemini_confidence: geminiData?.confidence ?? null,
    provider: 'grok' as const,
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

    // Accept a single `keyword` (legacy single-keyword refresh) or `keywords[]`
    // (orchestrator batch). Either way we resolve to a deduped list (cap 5).
    const rawKeywords: string[] = Array.isArray(body.keywords)
      ? body.keywords
      : (body.keyword ? [body.keyword] : [])
    const keywords = [...new Set(rawKeywords.map((k: string) => (k || '').trim()).filter(Boolean))].slice(0, 5)
    const singleKeyword = keywords.length === 1 ? keywords[0] : null

    const businessProfile = (ctx.company?.business_profile ?? null) as BusinessProfile | null

    if (keywords.length === 0) {
      // Return suggested keywords from business profile if user has none yet
      const companyKeywords: string[] = ctx.company?.keywords || []
      const suggestedKeywords = businessProfile?.primaryKeywords?.filter(
        k => !companyKeywords.includes(k)
      ).slice(0, 10) || []
      await cost.flush()
      return NextResponse.json({
        error: 'Missing keyword',
        suggested_keywords: suggestedKeywords,
      }, { status: 400 })
    }

    // Per-keyword cache check (only for a single, non-forced refresh).
    if (singleKeyword && !force) {
      const { data: company } = await ctx.supabase
        .from('companies').select('keyword_trends').eq('id', ctx.user.id).single()
      const existing = company?.keyword_trends as Record<string, any> | null
      const kwData = existing?.[singleKeyword]
      if (kwData?.fetchedAt) {
        const age = Date.now() - new Date(kwData.fetchedAt).getTime()
        if (age < CACHE_MS) {
          console.log(`[generate-keyword-trends] cache hit for "${singleKeyword}", age:`, Math.round(age / 3600000), 'h')
          await cost.flush()
          return NextResponse.json({
            success: true, keyword: singleKeyword, cached: true,
            trends: kwData.israel || kwData.trends || [],
            israel: kwData.israel || kwData.trends || [],
            world: kwData.world || [],
            related_queries: (kwData as any).related_queries || [],
            gemini_trend: (kwData as any).gemini_trend || null,
          })
        }
      }
    }

    const geoContext = ctx.geoContext || 'העסק פעיל בכל רחבי ישראל.'

    // ── Build a stored entry per keyword ─────────────────────────────────────
    // Default: ONE DataForSEO Google Trends call for ALL keywords (real data,
    // ~$0.002 total, ZERO xAI calls). Fall back to the legacy Grok path only if
    // DataForSEO fails (or KEYWORD_TRENDS_PROVIDER=grok).
    const built: Record<string, any> = {}

    if (PROVIDER === 'dataforseo') {
      const t0 = Date.now()
      const res = await fetchGoogleTrends(keywords, { months: 12 })
      cost.add({ provider: 'dataforseo', model: 'google_trends_explore', webSearch: true, ms: Date.now() - t0 })

      if (res.ok && res.keywords.length > 0) {
        // Match each requested keyword back to its returned series (case-insensitive).
        for (const kw of keywords) {
          const match = res.keywords.find(k => k.keyword?.toLowerCase() === kw.toLowerCase()) ?? null
          if (match && match.series.some(p => typeof p.value === 'number')) {
            built[kw] = trendToStored(match)
          }
        }
        console.log(`[keyword_trends] DataForSEO: ${Object.keys(built).length}/${keywords.length} keywords with real data`)
      } else {
        console.warn(`[keyword_trends] DataForSEO failed (${res.error ?? 'no_data'}) — falling back to Grok`)
        for (const kw of keywords) {
          const stored = await fetchViaGrok(kw, cost, geoContext)
          if (stored) built[kw] = stored
        }
      }
    } else {
      // Forced legacy provider.
      for (const kw of keywords) {
        const stored = await fetchViaGrok(kw, cost, geoContext)
        if (stored) built[kw] = stored
      }
    }

    // ── Merge with existing, applying the keep-existing guard per keyword ─────
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
        continue
      }
      // No fresh data for this keyword — keep prior data if any (don't blank it).
      const prior = existing[kw]
      const priorCount = Array.isArray(prior?.israel) ? prior.israel.length
        : Array.isArray(prior?.trends) ? prior.trends.length : 0
      if (priorCount > 0) {
        console.log(`[keyword_trends] "${kw}" returned empty — keeping existing ${priorCount} trends`)
      }
    }

    const { error: saveError } = await ctx.supabase
      .from('companies').update({ keyword_trends: existing }).eq('id', ctx.user.id)

    if (saveError) {
      console.error('keyword_trends save error:', saveError.code, saveError.message)
    }

    await cost.flush()

    // Response shape: single-keyword refresh keeps the legacy flat shape the
    // trends page reads; a batch call returns a summary.
    if (singleKeyword) {
      const stored = existing[singleKeyword] ?? {}
      return NextResponse.json({
        success: true, keyword: singleKeyword,
        updated: updatedCount,
        trends: stored.israel ?? stored.trends ?? [],
        israel: stored.israel ?? stored.trends ?? [],
        world: stored.world ?? [],
        related_queries: stored.related_queries ?? [],
        gemini_trend: stored.gemini_trend ?? null,
        ...(saveError ? { saveError: saveError.message } : {}),
      })
    }

    return NextResponse.json({
      success: true,
      updated: updatedCount,
      total: keywords.length,
      keywords,
      ...(saveError ? { saveError: saveError.message } : {}),
    })
  } catch (e: any) {
    await cost?.flush()
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
