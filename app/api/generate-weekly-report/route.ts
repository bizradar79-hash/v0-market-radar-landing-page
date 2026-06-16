export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { getFullContext } from '@/lib/context'
import { ScanCostCollector } from '@/lib/scan/cost-tracker'
import { summarizeKeywordTrends, buildKeywordIntel } from '@/lib/keyword-trends/summarize'
import { NextResponse } from 'next/server'

const CACHE_MS = 7 * 24 * 60 * 60 * 1000

export async function POST(request: Request) {
  let cost = new ScanCostCollector(null, 'weekly_report')
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const params = new URL(request.url).searchParams
    const force = params.get('force') === 'true'
    const cachedOnly = params.get('cachedOnly') === 'true'
    const userId = ctx.user.id
    cost = new ScanCostCollector(userId, 'weekly_report')
    const companyName = ctx.company?.name || ''
    const industry = ctx.company?.industry || ''

    // Cached-only mode: DISPLAY the saved report, never generate (page load uses this).
    if (cachedOnly) {
      const { data: companyRow } = await ctx.supabase
        .from('companies').select('last_report').eq('id', userId).single()
      const saved = companyRow?.last_report as { generated_at?: string } | null
      await cost.flush()
      return NextResponse.json({
        success: true,
        report: saved?.generated_at ? saved : null,
        company_name: companyName,
        cached: true,
      })
    }

    // Cache check
    if (!force) {
      const { data: companyRow } = await ctx.supabase
        .from('companies').select('last_report').eq('id', userId).single()
      const cached = companyRow?.last_report as { generated_at?: string } | null
      if (cached?.generated_at) {
        const age = Date.now() - new Date(cached.generated_at).getTime()
        if (age < CACHE_MS) {
          await cost.flush()
          return NextResponse.json({ success: true, report: cached, company_name: companyName, cached: true })
        }
      }
    }

    // Fetch all JSONB data from companies row
    const { data: companyData } = await ctx.supabase
      .from('companies')
      .select('business_profile, seo_ranking, geo_ranking, industry_trends, competitor_trends, niche_opportunities, weekly_actions, keyword_trends')
      .eq('id', userId)
      .single()

    // Fetch top 8 competitors by threat score
    const { data: competitors } = await ctx.supabase
      .from('competitors')
      .select('name, website, services, threat_score, last_activity')
      .eq('company_id', userId)
      .order('threat_score', { ascending: false })
      .limit(8)

    // Fetch news from last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: news } = await ctx.supabase
      .from('news')
      .select('title, source, summary, category, sentiment, published_at')
      .eq('company_id', userId)
      .gte('published_at', sevenDaysAgo)
      .order('published_at', { ascending: false })
      .limit(8)

    // Fetch active tenders
    const today = new Date().toISOString().split('T')[0]
    const { data: tenders } = await ctx.supabase
      .from('tenders')
      .select('title, organization, deadline, budget, relevance_score')
      .eq('company_id', userId)
      .gte('deadline', today)
      .order('relevance_score', { ascending: false })
      .limit(5)

    // Fetch upcoming conferences
    const { data: conferences } = await ctx.supabase
      .from('conferences')
      .select('name, date, location, url')
      .eq('company_id', userId)
      .gte('date', today)
      .order('date', { ascending: true })
      .limit(4)

    // Fetch keyword trends
    const { data: trends } = await ctx.supabase
      .from('trends')
      .select('name, score, direction, category')
      .eq('company_id', userId)
      .order('score', { ascending: false })
      .limit(10)

    // Real keyword intelligence (DataForSEO) — authoritative, never AI-invented.
    // Include ALL client keywords (clients have only ~5-8), so the report reflects
    // every real keyword rather than a top-N slice.
    const kwTrends = (companyData as any)?.keyword_trends as Record<string, any> | null
    const kwSummary = summarizeKeywordTrends(kwTrends, { maxLines: 100, maxOpportunities: 20 })
    const kwLines = kwSummary[0] === 'אין נתוני מילות מפתח' ? [] : kwSummary
    const keywordIntel = buildKeywordIntel(kwTrends)

    const allData = {
      company: { name: companyName, industry, website: ctx.company?.website, business_profile: companyData?.business_profile },
      seo_ranking: companyData?.seo_ranking,
      geo_ranking: companyData?.geo_ranking,
      industry_trends: companyData?.industry_trends,
      competitor_trends: companyData?.competitor_trends,
      niche_opportunities: companyData?.niche_opportunities,
      weekly_actions: companyData?.weekly_actions,
      competitors: competitors || [],
      news: news || [],
      tenders: tenders || [],
      conferences: conferences || [],
      trends: trends || [],
      keyword_intel_real: kwLines,
    }

    const geminiKey = process.env.GEMINI_API_KEY
    if (!geminiKey) {
      await cost.flush()
      return NextResponse.json({ error: 'Missing GEMINI_API_KEY' }, { status: 500 })
    }

    const nowIso = new Date().toISOString()
    const kwBlock = kwLines.length > 0
      ? `\n\nנתוני מילות מפתח אמיתיים (DataForSEO — מקור סמכותי, השתמש במספרים האלה בלבד, אל תמציא מספרים):\n${kwLines.join('\n')}`
      : ''

    const prompt = `אתה יועץ עסקי בכיר. צור דוח שבועי מקצועי בעברית לבעל עסק בתחום ${industry}.
הדוח צריך לכלול תובנות אמיתיות, מספרים ספציפיים, והמלצות פעולה ברורות.
המידע: ${JSON.stringify(allData)}${kwBlock}
חשוב: בשדה trends.hot_keywords השתמש אך ורק במילות המפתח האמיתיות מהרשימה לעיל (אם קיימת). אל תמציא מילות מפתח או מספרי חיפוש.

החזר JSON בלבד (ללא markdown, ללא הסברים):
{
  "executive_summary": "3-4 משפטים — תמצית מנהלים עם הנקודות החשובות ביותר",
  "seo_geo": {
    "summary": "סיכום מצב הנוכחות הדיגיטלית",
    "top_positions": [{"query": "string", "position": 1, "appeared": true}],
    "opportunities": ["המלצה 1", "המלצה 2"]
  },
  "competitors": {
    "summary": "מה קורה עם המתחרים השבוע",
    "threats": [{"name": "string", "threat_score": 80, "threat": "למה זה מאיים"}],
    "opportunities": ["הזדמנות 1", "הזדמנות 2"]
  },
  "trends": {
    "hot_keywords": ["מילה 1", "מילה 2"],
    "competitor_moves": ["מהלך 1", "מהלך 2"],
    "market_insights": ["תובנה 1", "תובנה 2"]
  },
  "opportunities": {
    "new_niches": ["נישה 1", "נישה 2"],
    "distribution_channels": ["ערוץ 1", "ערוץ 2"],
    "actions": ["פעולה 1", "פעולה 2"]
  },
  "news_tenders": {
    "relevant_news": [{"title": "string", "summary": "string"}],
    "active_tenders": [{"title": "string", "deadline": "string", "organization": "string"}],
    "upcoming_conferences": [{"name": "string", "date": "string"}]
  },
  "weekly_actions": {
    "immediate": ["פעולה דחופה 1", "פעולה דחופה 2"],
    "short_term": ["פעולה קצר טווח 1", "פעולה קצר טווח 2"]
  },
  "generated_at": "${nowIso}"
}`

    const aiT0 = Date.now()
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    )

    if (!res.ok) {
      cost.add({ provider: 'gemini', model: 'gemini-2.5-flash', ms: Date.now() - aiT0 })
      const errText = await res.text()
      console.error('[weekly-report] Gemini HTTP error:', res.status, errText.slice(0, 300))
      await cost.flush()
      return NextResponse.json({ error: 'Gemini API error' }, { status: 500 })
    }

    const data = await res.json()
    cost.add({ provider: 'gemini', model: 'gemini-2.5-flash', data, ms: Date.now() - aiT0 })
    if (data.error) {
      console.error('[weekly-report] Gemini API error:', JSON.stringify(data.error))
      await cost.flush()
      return NextResponse.json({ error: 'Gemini API error' }, { status: 500 })
    }

    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    const s = clean.indexOf('{')
    const e = clean.lastIndexOf('}')
    if (s === -1 || e <= s) {
      console.error('[weekly-report] no JSON in response:', clean.slice(0, 300))
      await cost.flush()
      return NextResponse.json({ error: 'Invalid Gemini response' }, { status: 500 })
    }

    let report: any = {}
    try { report = JSON.parse(clean.slice(s, e + 1)) } catch (err) {
      console.error('[weekly-report] JSON parse error:', err)
      await cost.flush()
      return NextResponse.json({ error: 'Failed to parse report JSON' }, { status: 500 })
    }

    report.generated_at = nowIso

    // Deterministically attach REAL keyword intelligence (never AI-invented).
    if (!report.trends || typeof report.trends !== 'object') report.trends = {}
    if (keywordIntel.keywords.length > 0) {
      report.trends.keyword_intel = keywordIntel.keywords
      report.trends.keyword_opportunities = keywordIntel.opportunities
      // Ensure hot_keywords reflects the real top movers (override any model guess).
      report.trends.hot_keywords = keywordIntel.keywords.slice(0, 6).map((k) => k.keyword)
    }

    const { error: dbError } = await ctx.supabase
      .from('companies').update({ last_report: report } as any).eq('id', userId)
    if (dbError) console.warn('[weekly-report] DB save error:', dbError.message)

    await cost.flush()
    return NextResponse.json({ success: true, report, company_name: companyName })
  } catch (e: any) {
    console.error('[generate-weekly-report] error:', e?.message)
    await cost.flush()
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
