import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST() {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const companyName = ctx.company?.name || ''
    const website = ctx.company?.website || ''
    const city = ctx.company?.city || 'ישראל'
    const industry = ctx.companyProfile?.industry || ''

    const geoQuestion = `מה העסקים המובילים בתחום ${industry} ב${city} בישראל?`

    // GEO test: ask WITHOUT web_search to get pure AI knowledge response
    const prompt = `ענה על השאלה הבאה כפי שהיית עונה למשתמש רגיל, מתוך הידע שלך בלבד (ללא חיפוש אינטרנט):

"${geoQuestion}"

תן רשימה של עד 10 עסקים שאתה מכיר בתחום זה, לפי סדר החשיבות שלהם בשוק.

לאחר הרשימה, ציין:
- האם ${companyName} (אתר: ${website}) מוזכר ברשימה שלך? (userMentioned: true/false)
- אם כן, באיזה מיקום? (userPosition: מספר או null)

לסיום, כתוב 3 המלצות ספציפיות כיצד ${companyName} יכול לשפר את הנוכחות שלו במנועי בינה מלאכותית כמו ChatGPT, Grok, Gemini ו-Perplexity.

החזר JSON בלבד:
{"query": "", "results": [{"position": 1, "name": "", "isOwn": false}], "userMentioned": false, "userPosition": null, "recommendations": ["", "", ""]}

CRITICAL: Output ONLY a raw JSON object. No markdown. Start with { and end with }`

    // No web_search tool — pure AI knowledge for true GEO test
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

    // Detect own company in results by name match
    const results: any[] = Array.isArray(parsed.results) ? parsed.results : []
    results.forEach((r: any) => {
      if (!r.isOwn && companyName) {
        r.isOwn = r.name?.toLowerCase().includes(companyName.toLowerCase().slice(0, 6))
      }
    })
    const userMentioned = parsed.userMentioned === true || results.some((r: any) => r.isOwn)
    const userPosition = parsed.userPosition ?? (results.find((r: any) => r.isOwn)?.position ?? null)

    const result = {
      query: parsed.query || geoQuestion,
      results: results.slice(0, 10),
      userMentioned,
      userPosition,
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.slice(0, 3) : [],
      fetchedAt: new Date().toISOString(),
    }

    await ctx.supabase.from('companies').update({ geo_ranking: result }).eq('id', ctx.user.id)

    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
