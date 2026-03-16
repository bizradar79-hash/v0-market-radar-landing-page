import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { competitorId, name, website } = await request.json()
    if (!competitorId || !name) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

    const prompt = `חפש את הפרטים הבאים על העסק: ${name}${website ? ` (אתר: ${website})` : ''}
מצא: כתובת מדויקת, טלפון, דירוג גוגל, מספר ביקורות, 3 ביקורות טובות ו-3 ביקורות פחות טובות
לכל ביקורת כלול: שם הכותב, ציון (1-5), טקסט הביקורת
החזר JSON בלבד:
{"address": "", "phone": "", "rating": 0, "review_count": 0, "top_reviews": [{"author": "", "rating": 0, "text": ""}], "bottom_reviews": [{"author": "", "rating": 0, "text": ""}]}`

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

    let parsed: any = {}
    if (start !== -1 && end > start) {
      try { parsed = JSON.parse(clean.slice(start, end + 1)) } catch {}
    }

    const rating = typeof parsed.rating === 'number' && parsed.rating > 0 ? parsed.rating : null
    const reviewCount = typeof parsed.review_count === 'number' ? parsed.review_count : null

    // Recalculate threat score with rating bonus (current DB score is the base)
    const updates: Record<string, any> = { google_rating: rating, google_review_count: reviewCount }
    if (rating !== null) {
      const { data: comp } = await ctx.supabase
        .from('competitors').select('threat_score').eq('id', competitorId).eq('company_id', ctx.user.id).single()
      if (comp?.threat_score != null) {
        let bonus = 0
        if (rating >= 4.5) bonus += 20
        else if (rating >= 4.0) bonus += 15
        else if (rating >= 3.5) bonus += 10
        if (reviewCount != null) {
          if (reviewCount > 500) bonus += 10
          else if (reviewCount >= 100) bonus += 5
        }
        updates.threat_score = Math.min(100, comp.threat_score + bonus)
      }
    }

    const { error: dbError } = await ctx.supabase
      .from('competitors').update(updates).eq('id', competitorId).eq('company_id', ctx.user.id)
    if (dbError) console.warn('fetch-competitor-rating DB save failed:', dbError.message, dbError.code)

    return NextResponse.json({ success: true, rating, reviewCount, threat_score: updates.threat_score ?? null })
  } catch (e: any) {
    console.error('fetch-competitor-rating error:', e?.message)
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
