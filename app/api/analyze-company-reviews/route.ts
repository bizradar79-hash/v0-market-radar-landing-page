export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'

const CACHE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

async function fetchReviewsWithGemini(companyName: string, domain: string): Promise<any | null> {
  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) return null

  const prompt = `אתה מומחה שיווק ישראלי. חפש מידע על ביקורות של העסק "${companyName}" (דומיין: ${domain}).
CRITICAL: החזר נתונים רק על הדומיין "${domain}" בדיוק — לא על עסקים אחרים עם שם דומה.
החזר JSON בלבד:
{
  "sources": [{"name": "Google Maps", "rating": 0, "review_count": 0, "url": ""}, {"name": "Facebook", "rating": 0, "review_count": 0, "url": ""}],
  "weighted_average": 0,
  "sentiment_score": 0,
  "overallSentiment": "חיובי",
  "positiveThemes": [""],
  "negativeThemes": [""],
  "opportunities": [""],
  "summary": ""
}`

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    )
    const data = await res.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    const s = clean.indexOf('{'); const e = clean.lastIndexOf('}')
    if (s === -1 || e <= s) return null
    const parsed = JSON.parse(clean.slice(s, e + 1))
    // Extract google_maps_url and google_rating from sources for backward compat
    const googleSource = Array.isArray(parsed.sources)
      ? parsed.sources.find((src: any) => (src.name || '').toLowerCase().includes('google'))
      : null
    return {
      sources: parsed.sources || [],
      weighted_average: typeof parsed.weighted_average === 'number' ? parsed.weighted_average : null,
      sentiment_score: typeof parsed.sentiment_score === 'number' ? parsed.sentiment_score : null,
      overallSentiment: parsed.overallSentiment || null,
      positiveThemes: Array.isArray(parsed.positiveThemes) ? parsed.positiveThemes : [],
      negativeThemes: Array.isArray(parsed.negativeThemes) ? parsed.negativeThemes : [],
      opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities : [],
      summary: parsed.summary || '',
      // Backward-compat fields
      google_rating: googleSource?.rating ?? null,
      google_review_count: googleSource?.review_count ?? null,
      google_maps_url: googleSource?.url && (googleSource.url as string).startsWith('http') ? googleSource.url : null,
    }
  } catch (e) {
    console.error('[reviews] Gemini error:', e)
    return null
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const force = new URL(request.url).searchParams.get('force') === 'true'
    if (!force) {
      const { data: company } = await ctx.supabase
        .from('companies').select('review_analysis').eq('id', ctx.user.id).single()
      const cached = company?.review_analysis as { fetchedAt?: string } | null
      if (cached?.fetchedAt) {
        const age = Date.now() - new Date(cached.fetchedAt).getTime()
        if (age < CACHE_MS) return NextResponse.json({ success: true, ...cached, cached: true })
      }
    }

    const companyName = ctx.company?.name || ''
    const website = ctx.company?.website || ''
    const domain = website
      ? (() => { try { return new URL(website.startsWith('http') ? website : `https://${website}`).hostname.replace(/^www\./, '') } catch { return website } })()
      : ''

    if (!companyName) return NextResponse.json({ error: 'Missing company name' }, { status: 400 })

    const reviews = await fetchReviewsWithGemini(companyName, domain)

    const result = {
      sources: reviews?.sources ?? [],
      weighted_average: reviews?.weighted_average ?? null,
      sentiment_score: reviews?.sentiment_score ?? null,
      overallSentiment: reviews?.overallSentiment ?? null,
      positiveThemes: reviews?.positiveThemes ?? [],
      negativeThemes: reviews?.negativeThemes ?? [],
      opportunities: reviews?.opportunities ?? [],
      summary: reviews?.summary ?? '',
      google_rating: reviews?.google_rating ?? null,
      google_review_count: reviews?.google_review_count ?? null,
      google_maps_url: reviews?.google_maps_url ?? null,
      fetchedAt: new Date().toISOString(),
    }

    await ctx.supabase.from('companies').update({ review_analysis: result }).eq('id', ctx.user.id)

    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
