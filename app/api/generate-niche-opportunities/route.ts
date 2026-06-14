import { getFullContext } from '@/lib/context'
import { ScanCostCollector } from '@/lib/scan/cost-tracker'
import { summarizeKeywordTrends } from '@/lib/keyword-trends/summarize'
import { NextResponse } from 'next/server'
import type { BusinessProfile } from '@/types/business-profile'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const CACHE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export async function POST(request: Request) {
  let cost = new ScanCostCollector(null, 'niche_opportunities')
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    cost = new ScanCostCollector(ctx.user.id, 'niche_opportunities')

    // Force: query param takes precedence, body is checked as fallback
    const forceQuery = new URL(request.url).searchParams.get('force') === 'true'
    const body = await request.json().catch(() => ({}))
    const force = forceQuery || body.force === true

    if (!force) {
      const { data: company } = await ctx.supabase
        .from('companies').select('niche_opportunities').eq('id', ctx.user.id).single()

      const cached = company?.niche_opportunities as { fetchedAt: string; opportunities: any[] } | null
      if (cached?.fetchedAt && cached.opportunities?.length > 0) {
        const age = Date.now() - new Date(cached.fetchedAt).getTime()
        if (age < CACHE_MS) {
          console.log('[generate-niche-opportunities] cache hit, age:', Math.round(age / 3600000), 'h')
          await cost.flush()
          return NextResponse.json({ success: true, ...cached, cached: true })
        }
      }
    }

    // Load all data in parallel
    const [
      { data: companyRow },
      { data: tenders },
      { data: newsItems },
      { data: leads },
      { data: conferences },
      { data: marketTrends },
    ] = await Promise.all([
      ctx.supabase.from('companies')
        .select('keyword_trends, seo_ranking, geo_ranking, weekly_actions, niche_opportunities, industry_trends, competitor_trends')
        .eq('id', ctx.user.id).single(),
      ctx.supabase.from('tenders')
        .select('title, organization, deadline, link, description')
        .eq('company_id', ctx.user.id).order('deadline', { ascending: true }).limit(10),
      ctx.supabase.from('news')
        .select('title, source, url, summary, published_at')
        .eq('company_id', ctx.user.id).order('published_at', { ascending: false }).limit(10),
      ctx.supabase.from('leads')
        .select('name, industry, location, score')
        .eq('company_id', ctx.user.id).order('score', { ascending: false }).limit(8),
      ctx.supabase.from('conferences')
        .select('name, date, location, url, description')
        .eq('company_id', ctx.user.id).order('date', { ascending: true }).limit(6),
      ctx.supabase.from('trends')
        .select('name, direction, category, description')
        .eq('company_id', ctx.user.id).limit(10),
    ])

    // Keyword trends — NEW DataForSEO shape (Record<keyword, StoredKeyword>) via
    // the shared summarizer so weekly-actions + niche-opportunities can't diverge.
    const kwTrends = companyRow?.keyword_trends as Record<string, any> | null
    const kwSummary = summarizeKeywordTrends(kwTrends)
    const trendLines = kwSummary[0] === 'אין נתוני מילות מפתח' ? [] : kwSummary

    // Extract already-used signal labels from weekly_actions to avoid exact duplicates
    const weeklyActions = companyRow?.weekly_actions as { actions: any[] } | null
    const usedSignalLabels: string[] = (weeklyActions?.actions || [])
      .flatMap((a: any) => (a.signals || []).map((s: any) => s.label || ''))
      .filter(Boolean)

    // Industry trends from new module
    const industryTrendsData = companyRow?.industry_trends as { trends?: any[] } | null
    const industryTrendLines = (industryTrendsData?.trends || []).slice(0, 6).map((t: any) =>
      `"${t.name}" (${t.direction || ''}, ${t.region || ''}, ביטחון ${t.confidence || ''}%) — ${t.evidence || ''}`
    )

    // Competitor trends — opportunities found
    const competitorTrendsData = companyRow?.competitor_trends as { competitor_data?: any[] } | null
    const competitorOpportunityLines = (competitorTrendsData?.competitor_data || [])
      .filter((c: any) => c.has_opportunity)
      .map((c: any) => `הזדמנות מול ${c.competitor_name}: ${c.opportunity}`)

    // SEO/GEO gaps — queries where we don't appear
    const seoData = companyRow?.seo_ranking as any
    const seoGapLines: string[] = []
    if (seoData?.queryVariants) {
      for (const v of seoData.queryVariants) {
        if (!v.appeared) seoGapLines.push(`SEO gap: "${v.query}" — לא מופיעים`)
        else if (v.position > 7) seoGapLines.push(`SEO weak: "${v.query}" — מיקום ${v.position}`)
      }
    }

    const competitorLines = (ctx.competitors || []).map((c: any) =>
      `"${c.name}" | ${c.services || ''} | threat: ${c.threat_score || 0}`
    )

    const tenderLines = (tenders || []).map((t: any) =>
      `"${t.title}" | ${t.organization || ''} | ${t.deadline ? new Date(t.deadline).toLocaleDateString('he-IL') : '?'}${t.link ? ` | ${t.link}` : ''}`
    )

    const newsLines = (newsItems || []).map((n: any) =>
      `"${n.title}" | ${n.source || ''} | ${n.published_at?.split('T')[0] || '?'}${n.url ? ` | ${n.url}` : ''}`
    )

    const leadLines = (leads || []).map((l: any) =>
      `"${l.name}" | ${l.industry || ''} | ${l.location || ''} | ציון ${l.score || 0}`
    )

    const conferenceLines = (conferences || []).map((c: any) =>
      `"${c.name}" | ${c.date ? new Date(c.date).toLocaleDateString('he-IL') : '?'} | ${c.location || ''}${c.url ? ` | ${c.url}` : ''}`
    )

    const marketTrendLines = (marketTrends || []).map((t: any) =>
      `"${t.name}" | ${t.direction || ''} | ${t.category || ''}`
    )

    const company = ctx.company
    const profile = ctx.companyProfile || ''
    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]

    const geoContext = ctx.geoContext || 'העסק פעיל בכל רחבי ישראל.'
    const businessProfile = (ctx.company?.business_profile ?? null) as BusinessProfile | null

    const profileEdge = businessProfile ? `
- יתרון תחרותי: ${businessProfile.competitiveAdvantage}
- מיצוב בשוק: ${businessProfile.marketPosition}
- נישות קשורות לחיפוש: ${[...businessProfile.primaryKeywords, ...businessProfile.secondaryKeywords].slice(0, 8).join(', ')}` : ''

    const prompt = `אתה אסטרטג שוק ישראלי מנוסה. היום הוא ${todayStr}.

פרטי העסק:
${profile}${profileEdge}
תחום: ${company?.industry || ''} | עיר: ${company?.city || ''} | היקף גיאוגרפי: ${geoContext}

=== נתונים עדכניים מהמערכת ===

## מתחרים (${competitorLines.length}):
${competitorLines.length > 0 ? competitorLines.join('\n') : 'אין'}

## הזדמנויות מול מתחרים (${competitorOpportunityLines.length}):
${competitorOpportunityLines.length > 0 ? competitorOpportunityLines.join('\n') : 'אין'}

## טרנדים בתעשייה — real-time (${industryTrendLines.length}):
${industryTrendLines.length > 0 ? industryTrendLines.join('\n') : 'אין'}

## טרנדים עולים — keyword trends (${trendLines.length}):
${trendLines.length > 0 ? trendLines.join('\n') : 'אין'}

## פערי SEO (מקום לנצל) (${seoGapLines.length}):
${seoGapLines.length > 0 ? seoGapLines.join('\n') : 'אין'}

## מגמות שוק כלליות (${marketTrendLines.length}):
${marketTrendLines.length > 0 ? marketTrendLines.join('\n') : 'אין'}

## מכרזים פתוחים (${tenderLines.length}):
${tenderLines.length > 0 ? tenderLines.join('\n') : 'אין'}

## חדשות אחרונות (${newsLines.length}):
${newsLines.length > 0 ? newsLines.join('\n') : 'אין'}

## לידים פוטנציאליים (${leadLines.length}):
${leadLines.length > 0 ? leadLines.join('\n') : 'אין'}

## כנסים קרובים (${conferenceLines.length}):
${conferenceLines.length > 0 ? conferenceLines.join('\n') : 'אין'}

## סיגנלים שכבר מוקצים לפעולות שבועיות (אל תחזור עליהם כסיגנל יחיד — ניתן לכלול אותם רק אם הם חלק מקלאסטר של 3+ סיגנלים מסוגים שונים):
${usedSignalLabels.length > 0 ? usedSignalLabels.join('\n') : 'אין'}

=== המשימה ===

נתח את הנתונים לעיל (ואת ידיעתך על השוק הישראלי) וזהה 3–5 נישות שוק חדשות שהעסק יכול לחדור אליהן.

כלל יצירת נישה — נישה תיווצר רק אם לפחות 2 מהתנאים הבאים מתקיימים:
1. ביקוש עולה (טרנדים או מגמות)
2. פעילות שוק (מכרזים / כנסים / חדשות)
3. לידים פוטנציאליים בתחום
4. תחרות נמוכה או בינונית
5. התאמה לפרופיל העסק

כללי סיגנלים:
- כל נישה חייבת לכלול לפחות 2 סיגנלים מהנתונים לעיל
- כל סיגנל חייב להפנות לפריט ספציפי בשם מהנתונים
- sourceRoute: trend→"/app/trends", lead→"/app/leads", tender→"/app/tenders", conference→"/app/conferences", news→"/app/news", competitor→"/app/competitors"
- כלול externalUrl אם ה-URL מופיע בנתונים
- סיגנל id: ייחודי למחרוזת כמו "s1", "s2"...

החזר JSON בלבד:
[{
  "id": "1",
  "nicheTitle": "שם הנישה (עד 50 תווים)",
  "shortInsightSummary": "תיאור קצר 1-2 משפטים",
  "opportunityScore": 75,
  "confidenceScore": 60,
  "signals": [{
    "id": "s1",
    "type": "trend|lead|tender|conference|competitor|news",
    "title": "שם הפריט הספציפי מהנתונים",
    "source": "שם המקור",
    "date": "YYYY-MM-DD",
    "relevanceScore": 80,
    "sourceRoute": "/app/trends",
    "externalUrl": "https://... (השמט אם אין)"
  }],
  "demandTrend": "עולה|יציב|יורד",
  "competitionLevel": "נמוכה|בינונית|גבוהה",
  "estimatedLeadPotential": "5–10 לידים",
  "estimatedMarketSize": "₪1M–3M שנתי",
  "region": "ישראל",
  "category": "קטגוריה",
  "whyThisNicheFitsYourBusiness": "הסבר ספציפי",
  "strategicNextSteps": ["שלב 1", "שלב 2", "שלב 3"],
  "relatedKeywords": ["מילה1", "מילה2"],
  "relatedCompetitors": ["מתחרה1"],
  "status": "new"
}]

CRITICAL: Output ONLY a raw JSON array. No markdown. Start with [ and end with ]`

    const aiT0 = Date.now()
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
    cost.add({ provider: 'xai', model: 'grok-4-fast-non-reasoning', webSearch: true, data, ms: Date.now() - aiT0 })
    if (!response.ok || !data.output) {
      await cost.flush()
      return NextResponse.json({ error: 'Grok API error', detail: data }, { status: 500 })
    }

    const text = data.output
      .filter((item: any) => item.type === 'message')
      .flatMap((item: any) => item.content)
      .filter((c: any) => c.type === 'output_text')
      .map((c: any) => c.text)
      .join('')

    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    const start = clean.indexOf('[')
    const end = clean.lastIndexOf(']')
    if (start === -1 || end <= start) {
      await cost.flush()
      return NextResponse.json({ error: 'No JSON array in response', raw: text.slice(0, 500) }, { status: 500 })
    }

    let opportunities: any[] = []
    try {
      const parsed = JSON.parse(clean.slice(start, end + 1))
      opportunities = Array.isArray(parsed) ? parsed : []
    } catch {
      await cost.flush()
      return NextResponse.json({ error: 'JSON parse failed', raw: clean.slice(0, 500) }, { status: 500 })
    }

    // Normalize and filter — never ask Grok to self-filter
    opportunities = opportunities
      .filter(n => n.nicheTitle && (n.signals?.length || 0) >= 1 && (n.opportunityScore || 0) > 0)
      .slice(0, 5)
      .map((n, i) => ({
        ...n,
        id: String(n.id || i + 1),
        status: 'new',
        signals: (n.signals || []).map((s: any, si: number) => ({
          ...s,
          id: s.id || `${i + 1}-${si + 1}`,
          externalUrl: s.externalUrl || undefined,
        })),
      }))

    // Tag new scan results as auto-generated
    const autoNiches = opportunities.map(n => ({ ...n, source: 'auto' }))

    // Preserve manual niches (user-added via market analysis) — never overwrite them
    const existingData = companyRow?.niche_opportunities as { opportunities: any[] } | null
    const manualNiches = (existingData?.opportunities || []).filter(
      (n: any) => n.source === 'manual' || n.source === 'market_analysis'
    )

    const payload = { fetchedAt: now.toISOString(), opportunities: [...autoNiches, ...manualNiches] }

    const { error: saveError } = await ctx.supabase
      .from('companies').update({ niche_opportunities: payload }).eq('id', ctx.user.id)

    if (saveError) {
      console.error('niche_opportunities save error:', saveError.code, saveError.message)
    }

    await cost.flush()
    return NextResponse.json({ success: true, ...payload, saveError: saveError?.message })
  } catch (e: any) {
    await cost.flush()
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
