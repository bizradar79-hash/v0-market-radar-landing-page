import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'

export const maxDuration = 30

export async function POST(request: Request) {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { competitorId, name, website } = await request.json()
    if (!competitorId || !name) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

    const prompt = `מצא את הדירוג הממוצע בגוגל ומספר הביקורות של החברה: ${name}${website ? ` (אתר: ${website})` : ''}
חפש בגוגל את שם החברה + "ביקורות" או "דירוג" בעברית ובאנגלית.
החזר JSON בלבד: {"rating": 4.5, "review_count": 120}
אם לא מצאת דירוג, החזר: {"rating": null, "review_count": null}
CRITICAL: Output ONLY raw JSON. No markdown, no explanation.`

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
      return NextResponse.json({ error: 'xAI error' }, { status: 500 })
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
    let rating: number | null = null
    let reviewCount: number | null = null

    if (start !== -1 && end > start) {
      try {
        const parsed = JSON.parse(clean.slice(start, end + 1))
        rating = typeof parsed.rating === 'number' ? Math.min(5, Math.max(0, parsed.rating)) : null
        reviewCount = typeof parsed.review_count === 'number' ? Math.max(0, parsed.review_count) : null
      } catch { /* ignore */ }
    }

    // Save to DB
    await ctx.supabase
      .from('competitors')
      .update({ google_rating: rating, google_review_count: reviewCount })
      .eq('id', competitorId)
      .eq('company_id', ctx.user.id)

    return NextResponse.json({ success: true, rating, reviewCount })
  } catch (e: any) {
    console.error('fetch-competitor-rating error:', e?.message)
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
