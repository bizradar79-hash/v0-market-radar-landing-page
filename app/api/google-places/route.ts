import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Fuzzy match: check if at least `threshold` fraction of companyName words
// appear in the candidate string (case-insensitive).
function fuzzyMatchName(candidate: string, companyName: string, threshold = 0.6): boolean {
  const cand = candidate.toLowerCase()
  const words = companyName.toLowerCase().split(/\s+/).filter(w => w.length >= 2)
  if (words.length === 0) return false
  const matched = words.filter(w => cand.includes(w)).length
  return matched / words.length >= threshold
}

export async function GET() {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const companyName = ctx.company?.name || ''
    const city = ctx.company?.city || ''
    const website = ctx.company?.website || ''
    const domain = website ? (() => { try { return new URL(website.startsWith('http') ? website : `https://${website}`).hostname.replace(/^www\./, '') } catch { return '' } })() : ''

    if (!companyName) {
      return NextResponse.json({ rating: null, reviewCount: 0, reviews: [], address: '', phone: '' })
    }

    // Strict query: name + domain + city to minimise wrong-business matches
    const domainHint = domain ? ` (אתר: ${domain})` : ''
    const prompt = `חפש מידע על העסק הספציפי הזה בלבד: "${companyName}"${domainHint}${city ? ` בעיר ${city}` : ''}.

חשוב מאוד: חזור רק על מידע על העסק שתואם בדיוק את השם "${companyName}"${domain ? ` ו/או הדומיין ${domain}` : ''}. אל תחזיר מידע על עסקים אחרים עם שם דומה.
אם יש ספק לגבי זיהוי העסק — ציין confidence_score נמוך.

מצא: כתובת מדויקת, טלפון, דירוג גוגל, מספר ביקורות, 3 ביקורות טובות ו-3 ביקורות פחות טובות.
לכל ביקורת כלול: שם הכותב, ציון (1-5), טקסט הביקורת.

החזר JSON בלבד:
{"matched_name": "", "confidence_score": 0, "address": "", "phone": "", "rating": 0, "review_count": 0, "top_reviews": [{"author": "", "rating": 0, "text": ""}], "bottom_reviews": [{"author": "", "rating": 0, "text": ""}]}`

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

    // Validate: reject if AI confidence is low OR matched name doesn't pass fuzzy check
    const confidence = typeof parsed.confidence_score === 'number' ? parsed.confidence_score : 100
    const matchedName = parsed.matched_name || ''
    const nameIsValid = matchedName
      ? fuzzyMatchName(matchedName, companyName, 0.6) || fuzzyMatchName(companyName, matchedName, 0.6)
      : true // if AI didn't return matched_name, trust confidence_score alone

    if (confidence < 60 || !nameIsValid) {
      console.warn(`[google-places] low confidence (${confidence}) or name mismatch ("${matchedName}" vs "${companyName}") — returning empty`)
      return NextResponse.json({ rating: null, reviewCount: 0, reviews: [], address: '', phone: '', source: 'xai', noMatch: true })
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
