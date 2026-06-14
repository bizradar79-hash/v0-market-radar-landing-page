export const dynamic = 'force-dynamic'

import { getFullContext } from '@/lib/context'
import { ScanCostCollector } from '@/lib/scan/cost-tracker'
import { summarizeKeywordTrends } from '@/lib/keyword-trends/summarize'
import { NextResponse } from 'next/server'
import type { BusinessProfile } from '@/types/business-profile'

export const maxDuration = 60

const CACHE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export async function POST(request: Request) {
  let cost = new ScanCostCollector(null, 'weekly_actions')
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    cost = new ScanCostCollector(ctx.user.id, 'weekly_actions')

    // Force: query param takes precedence, body is checked as fallback
    const forceQuery = new URL(request.url).searchParams.get('force') === 'true'
    const body = await request.json().catch(() => ({}))
    const force = forceQuery || body.force === true

    if (!force) {
      const { data: company } = await ctx.supabase
        .from('companies').select('weekly_actions').eq('id', ctx.user.id).single()

      const cached = company?.weekly_actions as { fetchedAt: string; actions: any[] } | null
      if (cached?.fetchedAt && cached.actions?.length > 0) {
        const age = Date.now() - new Date(cached.fetchedAt).getTime()
        if (age < CACHE_MS) {
          await cost.flush()
          return NextResponse.json({ success: true, ...cached, cached: true })
        }
      }
    }

    // Load all real data in parallel
    const [
      { data: companyRow },
      { data: tenders },
      { data: news },
      { data: leads },
      { data: conferences },
    ] = await Promise.all([
      ctx.supabase.from('companies').select('keyword_trends, niche_opportunities, industry_trends, competitor_trends, seo_ranking, geo_ranking').eq('id', ctx.user.id).single(),
      ctx.supabase.from('tenders').select('title, organization, deadline, link, description').eq('company_id', ctx.user.id).order('deadline', { ascending: true }).limit(10),
      ctx.supabase.from('news').select('title, source, url, summary, category, published_at').eq('company_id', ctx.user.id).order('published_at', { ascending: false }).limit(10),
      ctx.supabase.from('leads').select('name, industry, location, score').eq('company_id', ctx.user.id).order('score', { ascending: false }).limit(8),
      ctx.supabase.from('conferences').select('name, date, location, url, description').eq('company_id', ctx.user.id).order('date', { ascending: true }).limit(5),
    ])

    // Keyword trends — NEW DataForSEO shape (Record<keyword, StoredKeyword>) via
    // the shared summarizer so weekly-actions + niche-opportunities can't diverge.
    const kwTrends = companyRow?.keyword_trends as Record<string, any> | null
    const kwSummary = summarizeKeywordTrends(kwTrends)
    const trendLines = kwSummary[0] === 'אין נתוני מילות מפתח' ? [] : kwSummary

    // Industry trends from new module
    const industryTrendsData = companyRow?.industry_trends as { trends?: any[] } | null
    const industryTrendLines = (industryTrendsData?.trends || []).slice(0, 5).map((t: any) =>
      `"${t.name}" (${t.direction || ''}, ${t.region || ''}) — ${t.evidence || ''} [מקור: ${t.source || ''}]`
    )

    // Competitor trends from new module
    const competitorTrendsData = companyRow?.competitor_trends as { competitor_data?: any[] } | null
    const competitorTrendLines = (competitorTrendsData?.competitor_data || []).flatMap((c: any) => {
      const lines: string[] = []
      if (c.new_activity) lines.push(`${c.competitor_name}: ${c.new_activity}`)
      if (c.has_opportunity) lines.push(`הזדמנות מול ${c.competitor_name}: ${c.opportunity}`)
      return lines
    })

    // SEO/GEO gaps
    const seoData = companyRow?.seo_ranking as any
    const geoData = companyRow?.geo_ranking as any
    const seoLines: string[] = []
    if (seoData?.queryVariants) {
      for (const v of seoData.queryVariants) {
        if (!v.appeared) seoLines.push(`לא מופיע בחיפוש: "${v.query}"`)
        else if (v.position > 5) seoLines.push(`מיקום ${v.position} בחיפוש: "${v.query}"`)
      }
    }

    // Tracked niches — drive strategic weekly actions
    const nicheData = companyRow?.niche_opportunities as { opportunities: any[] } | null
    const trackedNiches = (nicheData?.opportunities || []).filter((n: any) => n.status === 'tracking')

    const competitorNames = ctx.competitors?.map((c: any) => c.name).filter(Boolean) || []

    const tenderLines = (tenders || []).map((t: any) =>
      `"${t.title}" | ${t.organization || ''} | דדליין: ${t.deadline ? new Date(t.deadline).toLocaleDateString('he-IL') : '?'}${t.link ? ` | ${t.link}` : ''}`
    )

    const newsLines = (news || []).map((n: any) =>
      `"${n.title}" | ${n.source || ''} | ${n.published_at ? n.published_at.split('T')[0] : '?'}${n.url ? ` | ${n.url}` : ''}`
    )

    const leadLines = (leads || []).map((l: any) =>
      `"${l.name}" | ${l.industry || ''} | ${l.location || ''} | ציון ${l.score || 0}`
    )

    const conferenceLines = (conferences || []).map((c: any) =>
      `"${c.name}" | ${c.date ? new Date(c.date).toLocaleDateString('he-IL') : '?'} | ${c.location || ''}${c.url ? ` | ${c.url}` : ''}`
    )

    const company = ctx.company
    const profile = ctx.companyProfile || ''
    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]

    const geoContext = ctx.geoContext || 'העסק פעיל בכל רחבי ישראל.'
    const businessProfile = (ctx.company?.business_profile ?? null) as BusinessProfile | null

    const profileSummary = businessProfile ? `
## פרופיל עסקי מפורט:
- פעילות עיקרית: ${businessProfile.coreActivity}
- מודל עסקי: ${businessProfile.businessModel}
- מוצרים/שירותים: ${businessProfile.products.map(p => `${p.name} (${p.targetAudience})`).join(' | ')}
- יתרון תחרותי: ${businessProfile.competitiveAdvantage}
- מיצוב בשוק: ${businessProfile.marketPosition}` : ''

    const prompt = `אתה יועץ עסקי ישראלי מנוסה. היום הוא ${todayStr}.

פרטי העסק:
${profile}${profileSummary}
תחום: ${company?.industry || ''} | עיר: ${company?.city || ''} | היקף גיאוגרפי: ${geoContext}

=== נתונים עדכניים מהמערכת ===

## מתחרים (${competitorNames.length}):
${competitorNames.length > 0 ? competitorNames.join(', ') : 'אין נתונים'}

## פעילות מתחרים לאחרונה (${competitorTrendLines.length}):
${competitorTrendLines.length > 0 ? competitorTrendLines.join('\n') : 'אין נתונים'}

## טרנדים בתעשייה — real-time (${industryTrendLines.length}):
${industryTrendLines.length > 0 ? industryTrendLines.join('\n') : 'אין נתונים'}

## טרנדים עולים — keyword trends (${trendLines.length}):
${trendLines.length > 0 ? trendLines.join('\n') : 'אין נתונים'}

## פערי SEO (${seoLines.length}):
${seoLines.length > 0 ? seoLines.join('\n') : 'אין נתונים'}

## מכרזים פתוחים (${tenderLines.length}):
${tenderLines.length > 0 ? tenderLines.join('\n') : 'אין מכרזים'}

## חדשות אחרונות (${newsLines.length}):
${newsLines.length > 0 ? newsLines.join('\n') : 'אין חדשות'}

## לידים פוטנציאליים (${leadLines.length}):
${leadLines.length > 0 ? leadLines.join('\n') : 'אין לידים'}

## כנסים קרובים (${conferenceLines.length}):
${conferenceLines.length > 0 ? conferenceLines.join('\n') : 'אין כנסים'}
${trackedNiches.length > 0 ? `
## נישות אסטרטגיות שהמשתמש עוקב אחריהן (${trackedNiches.length}):
${trackedNiches.map((n: any) =>
  `"${n.nicheTitle}" — ${n.shortInsightSummary || ''} | מילות מפתח: ${(n.relatedKeywords || []).join(', ')}`
).join('\n')}` : ''}

=== המשימה ===

הכן 5-7 פעולות קונקרטיות שהעסק צריך לעשות השבוע.
כל פעולה חייבת להתבסס על נתון ספציפי מהנתונים לעיל (טרנד, מתחרה, מכרז, חדשה, ליד, כנס).
אל תמציא נתונים שלא הופיעו למעלה.
${trackedNiches.length > 0 ? `
חשוב: עבור כל נישה אסטרטגית שצוינה למעלה, כלול לפחות פעולה אחת שמקדמת נישה זו השבוע. פעולות אלה יהיו אסטרטגיות ומוכוונות עתיד. ציין את שם הנישה בשדה "summary" של הפעולה כך שהמשתמש ידע לאיזו נישה הפעולה שייכת.` : ''}

בשדה "signals" — ציין אילו פריטים ספציפיים מהמערכת הובילו להמלצה (שם הטרנד/מתחרה/מכרז/חדשה).
- עבור טרנד → sourceRoute: "/app/trends"
- עבור מתחרה → sourceRoute: "/app/competitors"
- עבור מכרז → sourceRoute: "/app/tenders" ואם יש לינק חיצוני → externalUrl
- עבור חדשה → sourceRoute: "/app/news" ואם יש URL → externalUrl
- עבור ליד → sourceRoute: "/app/leads"
- עבור כנס → sourceRoute: "/app/conferences" ואם יש URL → externalUrl
- עבור מילת מפתח/טרנד → sourceRoute: "/app/trends"

החזר JSON בלבד:
[{
  "id": "1",
  "title": "כותרת קצרה (עד 60 תווים)",
  "category": "מכרז|ליד|מתחרה|טרנד|שיווק|כנס|כללי",
  "priority": "גבוהה|בינונית|נמוכה",
  "effort": "נמוך|בינוני|גבוה",
  "summary": "הסבר קצר 1-2 משפטים",
  "details": "תיאור מפורט של הפעולה",
  "steps": ["שלב 1", "שלב 2", "שלב 3"],
  "signals": [
    {
      "type": "trend|competitor|tender|news|lead|conference|keyword",
      "label": "טרנד: שם ספציפי מהנתונים",
      "description": "משפט אחד למה זה רלוונטי עכשיו",
      "sourceRoute": "/app/trends",
      "externalUrl": "https://... (אם קיים בנתונים, אחרת השמט)"
    }
  ],
  "expected_outcome": "מה תצפה לקבל כתוצאה"
}]

CRITICAL: Output ONLY a raw JSON array. No markdown. Start with [ and end with ]`

    // Helper: keep the existing stored actions if we have them, otherwise report
    // a soft failure. Used whenever xAI returns nothing usable so a transient
    // upstream hiccup never overwrites a good weekly-actions value with empty.
    async function keepExistingOrFail(reason: string) {
      await cost.flush()
      const { data: prev } = await ctx!.supabase
        .from('companies').select('weekly_actions').eq('id', ctx!.user.id).single()
      const prevActions = (prev?.weekly_actions as any)?.actions
      if (Array.isArray(prevActions) && prevActions.length > 0) {
        console.warn(`[weekly_actions] ${reason} — keeping existing ${prevActions.length} actions`)
        return NextResponse.json({
          success: true, kept_existing: true, reason,
          fetchedAt: (prev?.weekly_actions as any)?.fetchedAt ?? null,
          actions: prevActions,
        })
      }
      console.error(`[weekly_actions] ${reason} — no existing actions to fall back on`)
      return NextResponse.json({ error: reason }, { status: 502 })
    }

    const aiT0 = Date.now()
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
          // No web_search — actions must be grounded in the data we provide
        }),
      })
    } catch (err: any) {
      cost.add({ provider: 'xai', model: 'grok-4-fast-non-reasoning', ms: Date.now() - aiT0 })
      return keepExistingOrFail(`xAI fetch failed: ${err?.message}`)
    }

    // Guard: xAI can return a non-JSON body (502/504/empty/overload). Don't let
    // an unguarded response.json() throw and 500 the route — fall back instead.
    let data: any
    try {
      data = await response.json()
    } catch {
      cost.add({ provider: 'xai', model: 'grok-4-fast-non-reasoning', ms: Date.now() - aiT0 })
      return keepExistingOrFail(`non-JSON xAI body (status ${response.status})`)
    }
    cost.add({ provider: 'xai', model: 'grok-4-fast-non-reasoning', data, ms: Date.now() - aiT0 })
    if (!response.ok || !data.output) {
      return keepExistingOrFail('Grok API error')
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
      return keepExistingOrFail('No JSON array in response')
    }

    let actions: any[] = []
    try {
      const parsed = JSON.parse(clean.slice(start, end + 1))
      actions = Array.isArray(parsed) ? parsed.slice(0, 7) : []
    } catch {
      return keepExistingOrFail('JSON parse failed')
    }

    // Normalize: ensure IDs are strings, signals is always an array
    actions = actions.map((a, i) => ({
      ...a,
      id: String(a.id || i + 1),
      signals: Array.isArray(a.signals) ? a.signals : [],
    }))

    // FIX 2 — empty-write guard. A successful-but-EMPTY actions array must never
    // clobber a good stored value. If we produced nothing usable but already have
    // actions, keep the existing ones (mirrors keyword_trends / geo guards).
    if (actions.length === 0) {
      return keepExistingOrFail('model returned 0 actions')
    }

    const payload = { fetchedAt: now.toISOString(), actions }

    const { error: saveError } = await ctx.supabase
      .from('companies').update({ weekly_actions: payload }).eq('id', ctx.user.id)

    if (saveError) {
      console.error('weekly_actions save error:', saveError.code, saveError.message)
    }

    await cost.flush()
    return NextResponse.json({ success: true, ...payload, saveError: saveError?.message })
  } catch (e: any) {
    await cost.flush()
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
