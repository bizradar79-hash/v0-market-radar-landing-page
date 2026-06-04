export const dynamic = 'force-dynamic'

import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'
import type { BusinessProfile } from '@/types/business-profile'

export const maxDuration = 60

const CACHE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

async function fetchTrendsForRegion(keyword: string, region: 'israel' | 'world', geoContext?: string): Promise<any[]> {
  const geoText = region === 'israel'
    ? `בישראל. חפש מה אנשים מחפשים יותר בגוגל, מה עולה ברשתות חברתיות, מה מדוברים בפורומים ישראליים`
    : `בעולם (לא מוגבל לישראל). חפש מגמות גלובליות בגוגל, רשתות חברתיות, ופורומים בינלאומיים`

  const prompt = `מצא את 5 הנושאים והביטויים שהיו הכי טרנדיים בשבוע האחרון וקשורים למילה: '${keyword}' ${geoText}.${geoContext ? `\nהקשר עסקי: ${geoContext}` : ''}

גם תן לכל ביטוי 4 נקודות נתונים שבועיות (ערך 0-100 עוצמה) עבור 4 השבועות האחרונים מהישן לחדש.

החזר JSON בלבד:
[{"phrase": "", "trend": "עולה/יורד/יציב", "reason": "למה זה טרנדי עכשיו", "trend_data": [{"week": "W1", "value": 40}, {"week": "W2", "value": 55}, {"week": "W3", "value": 70}, {"week": "W4", "value": 85}]}]

CRITICAL: Output ONLY a raw JSON array. No markdown. Start with [ and end with ]`

  const response = await fetch('https://api.x.ai/v1/responses', {
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

  const data = await response.json()
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

async function fetchRelatedQueriesFromGemini(keyword: string): Promise<{
  trend: string; related_queries: string[]; confidence: number
} | null> {
  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) return null
  const prompt = `בהתבסס על ידע שלך על גוגל טרנדס, מה הטרנד של מילת המפתח "${keyword}" בישראל בשבועות האחרונים? עולה, יורד או יציב? ומה 5 ביטויי החיפוש הקשורים הכי פופולריים לה כרגע? החזר JSON: {"trend": "rising", "related_queries": ["", "", "", "", ""], "confidence": 80}`
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

export async function POST(request: Request) {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const forceQuery = new URL(request.url).searchParams.get('force') === 'true'
    const body = await request.json().catch(() => ({}))
    const keyword = body.keyword
    const force = forceQuery || body.force === true

    const businessProfile = (ctx.company?.business_profile ?? null) as BusinessProfile | null

    if (!keyword) {
      // Return suggested keywords from business profile if user has none yet
      const companyKeywords: string[] = ctx.company?.keywords || []
      const suggestedKeywords = businessProfile?.primaryKeywords?.filter(
        k => !companyKeywords.includes(k)
      ).slice(0, 10) || []
      return NextResponse.json({
        error: 'Missing keyword',
        suggested_keywords: suggestedKeywords,
      }, { status: 400 })
    }

    // Per-keyword cache check
    if (!force) {
      const { data: company } = await ctx.supabase
        .from('companies').select('keyword_trends').eq('id', ctx.user.id).single()
      const existing = company?.keyword_trends as Record<string, any> | null
      const kwData = existing?.[keyword]
      if (kwData?.fetchedAt) {
        const age = Date.now() - new Date(kwData.fetchedAt).getTime()
        if (age < CACHE_MS) {
          console.log(`[generate-keyword-trends] cache hit for "${keyword}", age:`, Math.round(age / 3600000), 'h')
          return NextResponse.json({
            success: true, keyword, cached: true,
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

    // Run Israel, World searches and Gemini related queries in parallel
    const [israelTrends, worldTrends, geminiData] = await Promise.all([
      fetchTrendsForRegion(keyword, 'israel', geoContext),
      fetchTrendsForRegion(keyword, 'world', geoContext),
      fetchRelatedQueriesFromGemini(keyword),
    ])

    // Merge with existing keyword_trends in companies table
    const { data: company } = await ctx.supabase
      .from('companies').select('keyword_trends').eq('id', ctx.user.id).single()

    const existing = (company?.keyword_trends && typeof company.keyword_trends === 'object')
      ? company.keyword_trends
      : {}

    // Guard: if this scan produced no trends for the keyword but we already have
    // data for it, keep the existing key untouched (don't overwrite with empties).
    const existingKey: any = (existing as any)[keyword]
    const existingKeyCount = Array.isArray(existingKey?.israel) ? existingKey.israel.length
      : Array.isArray(existingKey?.trends) ? existingKey.trends.length : 0
    const newKeyCount = (israelTrends?.length ?? 0) + (worldTrends?.length ?? 0)

    if (existingKeyCount > 0 && newKeyCount === 0) {
      console.log(`[keyword_trends] "${keyword}" returned empty — keeping existing ${existingKeyCount} trends`)
      return NextResponse.json({
        success: true, keyword, kept_existing: true,
        israel: existingKey?.israel ?? existingKey?.trends ?? [],
        world: existingKey?.world ?? [],
      })
    }

    const updated = {
      ...existing,
      [keyword]: {
        fetchedAt: new Date().toISOString(),
        trends: israelTrends, // backward-compat alias
        israel: israelTrends,
        world: worldTrends,
        related_queries: geminiData?.related_queries ?? [],
        gemini_trend: geminiData?.trend ?? null,
        gemini_confidence: geminiData?.confidence ?? null,
      },
    }

    const { error: saveError } = await ctx.supabase
      .from('companies').update({ keyword_trends: updated }).eq('id', ctx.user.id)

    if (saveError) {
      console.error('keyword_trends save error:', saveError.code, saveError.message)
      return NextResponse.json({
        success: true, keyword,
        trends: israelTrends, israel: israelTrends, world: worldTrends,
        saveError: saveError.message,
      })
    }

    return NextResponse.json({ success: true, keyword, trends: israelTrends, israel: israelTrends, world: worldTrends, related_queries: geminiData?.related_queries ?? [], gemini_trend: geminiData?.trend ?? null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
