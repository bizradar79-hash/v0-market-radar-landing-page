import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'

export const maxDuration = 30

export async function POST(request: Request) {
  const debug: Record<string, any> = {}
  try {
    debug.step = 'auth'
    const ctx = await getFullContext()
    if (!ctx) {
      debug.error = 'getFullContext returned null — not authenticated'
      return NextResponse.json({ success: false, debug }, { status: 401 })
    }
    debug.userId = ctx.user.id

    debug.step = 'parse-body'
    const body = await request.json()
    const { competitorId, name, website } = body
    debug.input = { competitorId, name, website }

    if (!competitorId || !name) {
      debug.error = 'Missing competitorId or name'
      return NextResponse.json({ success: false, debug }, { status: 400 })
    }

    debug.step = 'xai-call'
    debug.model = 'grok-4-fast-non-reasoning'

    const prompt = `מצא את הדירוג בגוגל ומספר הביקורות של העסק: ${name}${website ? ` (אתר: ${website})` : ''}
החזר JSON בלבד: {"rating": 4.5, "review_count": 123}
אם לא נמצא מידע — החזר {"rating": null, "review_count": null}
CRITICAL: Output ONLY raw JSON object. No markdown, no explanation.`

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

    debug.xaiStatus = xaiRes.status
    debug.xaiOk = xaiRes.ok

    if (!xaiRes.ok) {
      const errText = await xaiRes.text()
      debug.xaiError = errText.slice(0, 500)
      debug.hasXaiKey = !!process.env.XAI_API_KEY
      return NextResponse.json({ success: false, debug }, { status: 500 })
    }

    const data = await xaiRes.json()
    debug.xaiOutputCount = data.output?.length ?? 0

    if (!data.output) {
      debug.error = 'xAI returned no output field'
      return NextResponse.json({ success: false, debug }, { status: 500 })
    }

    const text = data.output
      .filter((item: any) => item.type === 'message')
      .flatMap((item: any) => item.content)
      .filter((c: any) => c.type === 'output_text')
      .map((c: any) => c.text)
      .join('')

    debug.rawText = text.slice(0, 400)

    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    const start = clean.indexOf('{')
    const end = clean.lastIndexOf('}')
    debug.jsonFound = start !== -1 && end > start

    let rating: number | null = null
    let reviewCount: number | null = null

    if (debug.jsonFound) {
      try {
        const parsed = JSON.parse(clean.slice(start, end + 1))
        debug.parsed = parsed
        rating = typeof parsed.rating === 'number' ? Math.min(5, Math.max(0, parsed.rating)) : null
        reviewCount = typeof parsed.review_count === 'number' ? Math.max(0, Math.round(parsed.review_count)) : null
      } catch (parseErr: any) {
        debug.parseError = parseErr.message
        debug.parseAttempt = clean.slice(start, end + 1).slice(0, 200)
      }
    }

    debug.rating = rating
    debug.reviewCount = reviewCount

    // Save to DB
    debug.step = 'db-update'
    const { error: dbError } = await ctx.supabase
      .from('competitors')
      .update({ google_rating: rating, google_review_count: reviewCount })
      .eq('id', competitorId)
      .eq('company_id', ctx.user.id)

    if (dbError) {
      debug.dbError = { message: dbError.message, code: dbError.code }
      debug.dbNote = 'Migration may not have been run — run supabase/add_competitors_source.sql'
    } else {
      debug.dbSaved = true
    }

    return NextResponse.json({ success: true, rating, reviewCount, debug })
  } catch (e: any) {
    debug.exception = e?.message
    debug.stack = e?.stack?.split('\n').slice(0, 5)
    return NextResponse.json({ success: false, debug }, { status: 500 })
  }
}
