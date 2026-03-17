import { getFullContext } from '@/lib/context'
import { analyzeBusinessForSearch } from '@/lib/analyze-business'
import { NextResponse } from 'next/server'

export const maxDuration = 60

const CACHE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export async function POST(request: Request) {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const force = new URL(request.url).searchParams.get('force') === 'true'
    if (!force) {
      const { data: company } = await ctx.supabase
        .from('companies').select('geo_ranking').eq('id', ctx.user.id).single()
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
    const keywords: string[] = ctx.company?.keywords || []

    const isLocal = !!(
      geoArea.length > 0 &&
      !geoArea.includes('כל הארץ') &&
      geoArea.length <= 2 &&
      (geoArea.length === 1 || ['מקומי', 'באזור', 'בעיר', city].filter(Boolean).some(k => overview.includes(k)))
    )
    const scopeLocation = isLocal ? (city || 'ישראל') : 'ישראל'
    const scope = isLocal ? `חיפוש מקומי — ${scopeLocation}` : 'חיפוש ארצי'

    // ── Step 1: Business understanding ──────────────────────────────────────
    // Ask Grok to read the business overview and produce the right AI question
    const keywordString = keywords.slice(0, 5).join(', ')
    const fallbackQuestion = isLocal
      ? `מי הם העסקים המובילים בתחום ${industry}${keywordString ? ` (${keywordString})` : ''} ב${scopeLocation}?`
      : `מי הם העסקים המובילים בתחום ${industry}${keywordString ? ` (${keywordString})` : ''} בישראל?`

    const businessAnalysis = await analyzeBusinessForSearch(overview, city, isLocal, scopeLocation)
    const geoQuestion = businessAnalysis?.ai_question || fallbackQuestion

    // ── Step 2: GEO test — pure AI knowledge, no web_search ─────────────────
    const savedCompetitors: any[] = ctx.competitors || []
    const competitorNames = savedCompetitors.map((c: any) => c.name).filter(Boolean).slice(0, 10)

    const competitorListText = competitorNames.length > 0
      ? `\nמתחרים ידועים לסימון (isKnownCompetitor: true אם מוזכרים):\n${competitorNames.join(', ')}`
      : ''

    const contextLine = businessAnalysis?.what_business_does
      ? `בהתחשב בכך ש${companyName} ${businessAnalysis.what_business_does}`
      : `בהתחשב בתחום "${industry}"`

    const prompt = `ענה על השאלה הבאה מתוך הידע שלך בלבד, ללא חיפוש אינטרנט — כפי שמנוע AI כמו ChatGPT, Gemini או Perplexity היה עונה:

"${geoQuestion}"

תן רשימה של עד 10 עסקים שאתה מכיר בתחום זה, לפי סדר חשיבותם בשוק.
${competitorListText}

לאחר הרשימה, ציין:
- האם ${companyName} (אתר: ${website}) מוזכר ברשימה שלך? (userMentioned: true/false)
- אם כן, באיזה מיקום? (userPosition: מספר או null)

לסיום, כתוב 3 המלצות ספציפיות כיצד ${companyName} יכול לשפר את הנוכחות שלו במנועי AI כמו ChatGPT, Grok, Gemini ו-Perplexity, ${contextLine}.

החזר JSON בלבד:
{"query": "${geoQuestion}", "results": [{"position": 1, "name": "", "isOwn": false, "isKnownCompetitor": false}], "userMentioned": false, "userPosition": null, "recommendations": ["", "", ""]}

CRITICAL: Output ONLY a raw JSON object. No markdown. Start with { and end with }`

    // No web_search — pure AI knowledge for true GEO test
    const response = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'grok-4-fast-non-reasoning',
        input: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await response.json()
    if (!response.ok || !data.output) {
      return NextResponse.json({ error: 'xAI API error', detail: data }, { status: 500 })
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
      return NextResponse.json({ error: 'Failed to parse response', raw: text.slice(0, 500) }, { status: 500 })
    }

    let parsed: any = {}
    try { parsed = JSON.parse(clean.slice(start, end + 1)) } catch {
      return NextResponse.json({ error: 'JSON parse error', raw: text.slice(0, 500) }, { status: 500 })
    }

    // Post-process: enforce isOwn and isKnownCompetitor by name matching
    const results: any[] = (Array.isArray(parsed.results) ? parsed.results : []).slice(0, 10)
    const companyNameLower = companyName.toLowerCase()

    results.forEach((r: any) => {
      const rName = (r.name || '').toLowerCase()
      r.isOwn = companyNameLower.length >= 3 && (
        rName.includes(companyNameLower) || companyNameLower.includes(rName)
      )
      r.isKnownCompetitor = !r.isOwn && competitorNames.some(n => {
        const nLower = n.toLowerCase()
        return nLower.length >= 3 && (rName.includes(nLower) || nLower.includes(rName))
      })
    })

    const userMentioned = parsed.userMentioned === true || results.some((r: any) => r.isOwn)
    const userPosition = parsed.userPosition ?? (results.find((r: any) => r.isOwn)?.position ?? null)

    const result = {
      query: geoQuestion,
      results,
      userMentioned,
      userPosition,
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.slice(0, 3) : [],
      isLocal,
      scope,
      what_business_does: businessAnalysis?.what_business_does || '',
      fetchedAt: new Date().toISOString(),
    }

    await ctx.supabase.from('companies').update({ geo_ranking: result }).eq('id', ctx.user.id)

    return NextResponse.json({ success: true, ...result, businessAnalysis })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
