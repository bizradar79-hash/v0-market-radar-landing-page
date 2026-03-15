import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const companyName = ctx.company?.name || ''
    const city = ctx.company?.city || ''
    if (!companyName) {
      return NextResponse.json({ rating: null, reviewCount: 0, reviews: [], address: '', phone: '' })
    }

    const prompt = `חפש את הפרטים הבאים על העסק: ${companyName} בעיר ${city}
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
      return NextResponse.json({ rating: null, reviewCount: 0, reviews: [], address: '', phone: '' })
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

    const reviews = [
      ...(Array.isArray(parsed.top_reviews) ? parsed.top_reviews : []),
      ...(Array.isArray(parsed.bottom_reviews) ? parsed.bottom_reviews : []),
    ].map((r: any) => ({
      author: r.author || '',
      rating: typeof r.rating === 'number' ? r.rating : 0,
      text: r.text || '',
      time: '',
    }))

    const result = {
      address: parsed.address || '',
      phone: parsed.phone || '',
      rating: typeof parsed.rating === 'number' && parsed.rating > 0 ? parsed.rating : null,
      reviewCount: typeof parsed.review_count === 'number' ? parsed.review_count : reviews.length,
      reviews,
      source: 'xai',
    }

    const { error: dbError } = await ctx.supabase
      .from('companies')
      .update({ geo_data: result })
      .eq('id', ctx.user.id)
    if (dbError) console.warn('google-places DB save failed:', dbError.message)

    return NextResponse.json(result)
  } catch (e: any) {
    console.error('google-places error:', e?.message)
    return NextResponse.json({ rating: null, reviewCount: 0, reviews: [], address: '', phone: '' })
  }
}
