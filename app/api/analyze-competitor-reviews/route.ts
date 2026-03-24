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

חפש ביקורות מ: Google Maps, Facebook, מדריכים עסקיים ישראליים, פורומים ואתרי ביקורות.

לאחר מכן נתח את הביקורות שמצאת, מנקודת המבט של העסק "${companyName}" שפועל בתחום "${industry}" ומחפש הזדמנויות תחרותיות.

החזר JSON בלבד:
{
  "overallSentiment": "חיובי|מעורב|שלילי",
  "totalReviewsFound": 0,
  "averageRating": null,
  "positiveThemes": ["נושא חיובי 1", "נושא חיובי 2"],
  "negativeThemes": ["נושא שלילי 1", "נושא שלילי 2"],
  "recurringComplaints": ["תלונה חוזרת 1"],
  "opportunities": ["מה ${companyName} יכול לעשות טוב יותר 1", "הזדמנות 2"],
  "summary": "סיכום קצר של 2-3 משפטים",
  "sources": ["google maps", "facebook"]
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

    return NextResponse.json({
      success: true,
      overallSentiment: parsed.overallSentiment || 'מעורב',
      totalReviewsFound: parsed.totalReviewsFound ?? 0,
      averageRating: parsed.averageRating ?? null,
      positiveThemes: Array.isArray(parsed.positiveThemes) ? parsed.positiveThemes : [],
      negativeThemes: Array.isArray(parsed.negativeThemes) ? parsed.negativeThemes : [],
      recurringComplaints: Array.isArray(parsed.recurringComplaints) ? parsed.recurringComplaints : [],
      opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities : [],
      summary: parsed.summary || '',
      sources: Array.isArray(parsed.sources) ? parsed.sources : [],
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
