import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST() {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const companyName = ctx.company?.name || ''
    const website = ctx.company?.website || ''
    const city = ctx.company?.city || ''
    const industry = ctx.company?.industry || ''
    const overview = ctx.company?.business_overview || ctx.company?.description || ''
    const geoArea: string[] = ctx.company?.geographic_area || []
    // Use exact keywords from companies.keywords — same source as competitor search
    const keywords: string[] = ctx.company?.keywords || []
    const keywordString = keywords.slice(0, 5).join(', ')

    const isLocal = !!(
      geoArea.length > 0 &&
      !geoArea.includes('כל הארץ') &&
      geoArea.length <= 2 &&
      (geoArea.length === 1 || ['מקומי', 'באזור', 'בעיר', city].filter(Boolean).some(k => overview.includes(k)))
    )
    const scopeLocation = isLocal ? (city || 'ישראל') : 'ישראל'
    const scope = isLocal ? `חיפוש מקומי — ${scopeLocation}` : 'חיפוש ארצי'

    const searchQuery = [industry, scopeLocation, keywords.slice(0, 5).join(' ')].filter(Boolean).join(' ')
    const geoQuestion = isLocal
      ? `מי הם העסקים המובילים בתחום ${industry}${keywordString ? ` (${keywordString})` : ''} ב${scopeLocation}?`
      : `מי הם העסקים המובילים בתחום ${industry}${keywordString ? ` (${keywordString})` : ''} בישראל?`

    // Known competitors for comparison
    const savedCompetitors: any[] = ctx.competitors || []
    const competitorNames = savedCompetitors.map((c: any) => c.name).filter(Boolean).slice(0, 10)

    const competitorListText = competitorNames.length > 0
      ? `\nמתחרים ידועים לסימון (isKnownCompetitor: true אם מוזכרים):\n${competitorNames.join(', ')}`
      : ''

    const prompt = `ענה על השאלה הבאה מתוך הידע שלך בלבד, ללא חיפוש אינטרנט — כפי שמנוע AI כמו ChatGPT, Gemini או Perplexity היה עונה:

"${geoQuestion}"

תן רשימה של עד 10 עסקים שאתה מכיר בתחום זה, לפי סדר חשיבותם בשוק.
${competitorListText}

לאחר הרשימה, ציין:
- האם ${companyName} (אתר: ${website}) מוזכר ברשימה שלך? (userMentioned: true/false)
- אם כן, באיזה מיקום? (userPosition: מספר או null)

לסיום, כתוב 3 המלצות ספציפיות כיצד ${companyName} יכול לשפר את הנוכחות שלו במנועי AI כמו ChatGPT, Grok, Gemini ו-Perplexity, בהתחשב בתחום "${searchQuery}".

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
      fetchedAt: new Date().toISOString(),
    }

    await ctx.supabase.from('companies').update({ geo_ranking: result }).eq('id', ctx.user.id)

    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
