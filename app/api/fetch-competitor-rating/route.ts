import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'

export const maxDuration = 30

export async function POST(request: Request) {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { competitorId, name, website } = body
    if (!competitorId || !name) {
      return NextResponse.json({ error: 'Missing competitorId or name' }, { status: 400 })
    }

    const prompt = `מצא את הדירוג בגוגל ומספר הביקורות של העסק: ${name}${website ? ` (אתר: ${website})` : ''}
החזר JSON בלבד: {"rating": 4.5, "review_count": 123}
אם לא נמצא מידע — החזר {"rating": null, "review_count": null}
CRITICAL: Output ONLY raw JSON object. No markdown, no explanation, no extra text.`

    const xaiRes = await fetch('https://api.x.ai/v1/responses', {
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

    if (!xaiRes.ok) {
      const errText = await xaiRes.text()
      console.error('xAI error:', xaiRes.status, errText)
      return NextResponse.json({ error: `xAI ${xaiRes.status}`, detail: errText }, { status: 500 })
    }

    const data = await xaiRes.json()
    if (!data.output) {
      return NextResponse.json({ error: 'xAI returned no output', detail: data }, { status: 500 })
    }

    const text = data.output
      .filter((item: any) => item.type === 'message')
      .flatMap((item: any) => item.content)
      .filter((c: any) => c.type === 'output_text')
      .map((c: any) => c.text)
      .join('')

    console.log(`[fetch-competitor-rating] xAI raw for "${name}":`, text.slice(0, 200))

    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    const start = clean.indexOf('{')
    const end = clean.lastIndexOf('}')

    let rating: number | null = null
    let reviewCount: number | null = null

    if (start !== -1 && end > start) {
      try {
        const parsed = JSON.parse(clean.slice(start, end + 1))
        rating = typeof parsed.rating === 'number' ? Math.min(5, Math.max(0, parsed.rating)) : null
        reviewCount = typeof parsed.review_count === 'number' ? Math.max(0, Math.round(parsed.review_count)) : null
      } catch (parseErr) {
        console.error('[fetch-competitor-rating] JSON parse error:', parseErr, 'raw:', clean.slice(start, end + 1))
      }
    }

    // Save to DB — gracefully handle missing columns
    const { error: dbError } = await ctx.supabase
      .from('competitors')
      .update({ google_rating: rating, google_review_count: reviewCount })
      .eq('id', competitorId)
      .eq('company_id', ctx.user.id)

    if (dbError) {
      // Columns might not exist yet (migration not run) — that's fine, data still returned to frontend
      console.warn('[fetch-competitor-rating] DB update error (may need migration):', dbError.message, dbError.code)
    }

    return NextResponse.json({ success: true, rating, reviewCount })
  } catch (e: any) {
    console.error('[fetch-competitor-rating] exception:', e?.message)
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
