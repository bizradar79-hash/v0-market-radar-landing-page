import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const { query, region, category } = body
    if (!query) return NextResponse.json({ error: 'Missing query' }, { status: 400 })

    const regionStr = region || 'כל ישראל'
    const categoryStr = category || 'כללי'

    // Load all DB data in parallel
    const [
      { data: companyRow },
      { data: competitors },
      { data: leads },
      { data: tenders },
      { data: conferences },
      { data: newsItems },
      { data: marketTrends },
    ] = await Promise.all([
      ctx.supabase.from('companies')
        .select('keyword_trends, seo_ranking, geo_ranking, niche_opportunities')
        .eq('id', ctx.user.id).single(),
      ctx.supabase.from('competitors')
        .select('name, website, services, pricing, threat_score')
        .eq('company_id', ctx.user.id).limit(10),
      ctx.supabase.from('leads')
        .select('name, industry, location, score')
        .eq('company_id', ctx.user.id).order('score', { ascending: false }).limit(10),
      ctx.supabase.from('tenders')
        .select('title, organization, deadline, link, description')
        .eq('company_id', ctx.user.id).order('deadline', { ascending: true }).limit(10),
      ctx.supabase.from('conferences')
        .select('name, date, location, url, description')
        .eq('company_id', ctx.user.id).order('date', { ascending: true }).limit(6),
      ctx.supabase.from('news')
        .select('title, source, url, summary, published_at')
        .eq('company_id', ctx.user.id).order('published_at', { ascending: false }).limit(10),
      ctx.supabase.from('trends')
        .select('name, direction, category, description')
        .eq('company_id', ctx.user.id).limit(10),
    ])

    // Flatten keyword trends
    const kwTrends = companyRow?.keyword_trends as Record<string, any> | null
    const trendLines: string[] = []
    if (kwTrends) {
      for (const [kw, kwData] of Object.entries(kwTrends)) {
        const phrases: any[] = kwData?.israel || kwData?.trends || []
        for (const p of phrases.slice(0, 3)) {
          if (p.phrase) trendLines.push(`"${p.phrase}" (${p.trend || ''}) [keyword: ${kw}]`)
        }
      }
    }

    const profile = ctx.companyProfile || ''
    const company = ctx.company
    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]

    const competitorLines = (competitors || []).map((c: any) =>
      `"${c.name}" | ${c.services || ''} | threat: ${c.threat_score || 0}`
    )
    const leadLines = (leads || []).map((l: any) =>
      `"${l.name}" | ${l.industry || ''} | ${l.location || ''} | ציון ${l.score || 0}`
    )
    const tenderLines = (tenders || []).map((t: any) =>
      `"${t.title}" | ${t.organization || ''} | ${t.deadline ? new Date(t.deadline).toLocaleDateString('he-IL') : '?'}${t.link ? ` | ${t.link}` : ''}`
    )
    const conferenceLines = (conferences || []).map((c: any) =>
      `"${c.name}" | ${c.date ? new Date(c.date).toLocaleDateString('he-IL') : '?'} | ${c.location || ''}${c.url ? ` | ${c.url}` : ''}`
    )
    const newsLines = (newsItems || []).map((n: any) =>
      `"${n.title}" | ${n.source || ''} | ${n.published_at?.split('T')[0] || '?'}${n.url ? ` | ${n.url}` : ''}`
    )
    const marketTrendLines = (marketTrends || []).map((t: any) =>
      `"${t.name}" | ${t.direction || ''} | ${t.category || ''}`
    )

    const geoContext = ctx.geoContext || 'העסק פעיל בכל רחבי ישראל.'

    const prompt = `אתה אנליסט שוק ישראלי מנוסה. היום: ${todayStr}.

פרטי העסק:
${profile}
תחום: ${company?.industry || ''} | עיר: ${company?.city || ''} | היקף גיאוגרפי: ${geoContext}

=== שאלת הניתוח ===
שאילתה: "${query}"
אזור: ${regionStr}
קטגוריה: ${categoryStr}

=== נתוני מערכת קיימים ===

## מתחרים (${competitorLines.length}):
${competitorLines.length > 0 ? competitorLines.join('\n') : 'אין'}

## לידים (${leadLines.length}):
${leadLines.length > 0 ? leadLines.join('\n') : 'אין'}

## מכרזים (${tenderLines.length}):
${tenderLines.length > 0 ? tenderLines.join('\n') : 'אין'}

## כנסים (${conferenceLines.length}):
${conferenceLines.length > 0 ? conferenceLines.join('\n') : 'אין'}

## חדשות (${newsLines.length}):
${newsLines.length > 0 ? newsLines.join('\n') : 'אין'}

## מגמות שוק (${marketTrendLines.length}):
${marketTrendLines.length > 0 ? marketTrendLines.join('\n') : 'אין'}

## טרנדים ממילות מפתח (${trendLines.length}):
${trendLines.length > 0 ? trendLines.join('\n') : 'אין'}

=== המשימה ===
בצע ניתוח שוק מקיף לשאילתה "${query}" עבור ${regionStr} בקטגוריית ${categoryStr}.

השתמש ב-web_search לחפש מידע עדכני על:
1. גודל שוק ומגמות ביקוש
2. מתחרים מובילים בתחום
3. הזדמנויות שלא מנוצלות
4. סיכונים ומכשולים

כלול סיגנלים מ-2 מקורות:
- מנתוני המערכת לעיל (ציין מאיזה טבלה: competitor/lead/tender/conference/news/trend)
- מחיפוש האינטרנט (type: "news" או "trend")

sourceRoute לפי סוג:
- trend → "/app/trends"
- lead → "/app/leads"
- tender → "/app/tenders"
- conference → "/app/conferences"
- news → "/app/news"
- competitor → "/app/competitors"

כלול externalUrl לכל סיגנל שיש לו URL אמיתי מהנתונים.

החזר אובייקט JSON בלבד:
{
  "id": "1",
  "query": "${query}",
  "region": "${regionStr}",
  "category": "${categoryStr}",
  "summary": "תקציר ניתוח 2-3 משפטים",
  "demandScore": 75,
  "competitionScore": 60,
  "gapScore": 65,
  "leadPotential": "10–20 לידים",
  "marketMomentum": "עולה|יציב|רווי|בירידה",
  "signals": [{
    "id": "s1",
    "type": "trend|lead|tender|conference|competitor|news",
    "title": "שם הפריט מהמקור",
    "source": "שם המקור",
    "date": "YYYY-MM-DD",
    "relevanceScore": 85,
    "sourceRoute": "/app/trends",
    "externalUrl": "https://... (השמט אם אין)"
  }],
  "opportunities": ["הזדמנות 1", "הזדמנות 2", "הזדמנות 3"],
  "risks": ["סיכון 1", "סיכון 2"],
  "strategicRecommendations": ["המלצה 1", "המלצה 2", "המלצה 3"],
  "createdAt": "${now.toISOString()}"
}

CRITICAL: Output ONLY a raw JSON object. No markdown. Start with { and end with }`

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
    if (!response.ok || !data.output) {
      return NextResponse.json({ error: 'Grok API error', detail: data }, { status: 500 })
    }

    const text = data.output
      .filter((item: any) => item.type === 'message')
      .flatMap((item: any) => item.content)
      .filter((c: any) => c.type === 'output_text')
      .map((c: any) => c.text)
      .join('')

    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    const start = clean.indexOf('{')
    const end = clean.lastIndexOf('}')
    if (start === -1 || end <= start) {
      return NextResponse.json({ error: 'No JSON object in response', raw: text.slice(0, 500) }, { status: 500 })
    }

    let analysis: any = {}
    try {
      analysis = JSON.parse(clean.slice(start, end + 1))
    } catch {
      return NextResponse.json({ error: 'JSON parse failed', raw: clean.slice(0, 500) }, { status: 500 })
    }

    // Normalize — filter in code, never ask Grok to self-filter
    analysis = {
      ...analysis,
      id: String(analysis.id || '1'),
      query,
      region: regionStr,
      category: categoryStr,
      createdAt: now.toISOString(),
      demandScore: Math.min(100, Math.max(0, Number(analysis.demandScore) || 0)),
      competitionScore: Math.min(100, Math.max(0, Number(analysis.competitionScore) || 0)),
      gapScore: Math.min(100, Math.max(0, Number(analysis.gapScore) || 0)),
      signals: (Array.isArray(analysis.signals) ? analysis.signals : [])
        .filter((s: any) => s.title)
        .map((s: any, i: number) => ({
          ...s,
          id: s.id || `s${i + 1}`,
          externalUrl: s.externalUrl || undefined,
        })),
      opportunities: Array.isArray(analysis.opportunities) ? analysis.opportunities : [],
      risks: Array.isArray(analysis.risks) ? analysis.risks : [],
      strategicRecommendations: Array.isArray(analysis.strategicRecommendations) ? analysis.strategicRecommendations : [],
    }

    // Auto-save to DB
    const { error: saveError } = await ctx.supabase.from('market_analyses').insert({
      company_id: ctx.user.id,
      query,
      region: regionStr,
      category: categoryStr,
      result: analysis,
    })

    if (saveError) {
      console.error('[analyze-market] save error:', saveError.code, saveError.message)
    }

    return NextResponse.json({ success: true, analysis, saveError: saveError?.message })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
