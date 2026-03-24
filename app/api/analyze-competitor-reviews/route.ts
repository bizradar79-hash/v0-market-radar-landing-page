import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { competitorName, competitorWebsite } = await request.json().catch(() => ({}))
    if (!competitorName) return NextResponse.json({ error: 'Missing competitorName' }, { status: 400 })

    const companyName = ctx.company?.name || ''
    const industry = ctx.company?.industry || ''

    const prompt = `אתה מומחה ניתוח שוק ישראלי. השתמש ב-web_search כדי למצוא ביקורות על "${competitorName}"${competitorWebsite ? ` (אתר: ${competitorWebsite})` : ''}.

חפש ביקורות מ: Google Maps, Facebook, Zap, מדריכים עסקיים ישראליים, פורומים ואתרי ביקורות.
לכל מקור שמצאת — ציין את הדירוג ומספר הביקורות בו בנפרד.

לאחר מכן נתח את הביקורות מנקודת המבט של "${companyName}" שפועל בתחום "${industry}".

החזר JSON בלבד:
{
  "sources": [
    { "name": "Google Maps", "rating": 4.5, "review_count": 120, "url": "https://..." },
    { "name": "Facebook", "rating": 4.2, "review_count": 89, "url": "https://..." }
  ],
  "weighted_average": 4.3,
  "sentiment_score": 8.5,
  "overallSentiment": "חיובי",
  "totalReviewsFound": 209,
  "positiveThemes": ["נושא חיובי 1", "נושא חיובי 2"],
  "negativeThemes": ["נושא שלילי 1"],
  "recurringComplaints": ["תלונה חוזרת 1"],
  "opportunities": ["הזדמנות 1 עבור ${companyName}"],
  "summary": "סיכום קצר של 2-3 משפטים"
}

sources: רשימת מקורות עם דירוג וכמות ביקורות לכל מקור
weighted_average: ממוצע משוקלל לפי כמות ביקורות (1-5)
sentiment_score: ציון סנטימנט כולל (1-10) שמשקף עומק, עקביות ואיכות הביקורות
overallSentiment: חיובי | מעורב | שלילי
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

    // Normalize sources — support both object[] (new) and string[] (old)
    const rawSources = Array.isArray(parsed.sources) ? parsed.sources : []
    const sources = rawSources.map((s: any) =>
      typeof s === 'string'
        ? { name: s, rating: null, review_count: null, url: null }
        : { name: s.name || '', rating: s.rating ?? null, review_count: s.review_count ?? null, url: s.url ?? null }
    )

    // Derive totalReviewsFound from sources if not provided
    const totalFromSources = sources.reduce((sum: number, s: any) => sum + (s.review_count || 0), 0)

    return NextResponse.json({
      success: true,
      sources,
      weighted_average: parsed.weighted_average ?? null,
      sentiment_score: parsed.sentiment_score ?? null,
      overallSentiment: parsed.overallSentiment || 'מעורב',
      totalReviewsFound: parsed.totalReviewsFound ?? totalFromSources,
      averageRating: parsed.weighted_average ?? parsed.averageRating ?? null,
      positiveThemes: Array.isArray(parsed.positiveThemes) ? parsed.positiveThemes : [],
      negativeThemes: Array.isArray(parsed.negativeThemes) ? parsed.negativeThemes : [],
      recurringComplaints: Array.isArray(parsed.recurringComplaints) ? parsed.recurringComplaints : [],
      opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities : [],
      summary: parsed.summary || '',
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
