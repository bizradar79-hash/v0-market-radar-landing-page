export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { getFullContext } from '@/lib/context'
import { getPlaceDetails } from '@/lib/google-places'
import { NextResponse } from 'next/server'

const CACHE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

async function fetchReviewsWithGemini(companyName: string, domain: string): Promise<any | null> {
  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) return null

  const prompt = `אתה מומחה שיווק ישראלי. חפש מידע אמיתי על ביקורות של העסק "${companyName}" (דומיין בדיוק: ${domain}).
CRITICAL: החזר נתונים רק על הדומיין "${domain}" — לא על עסקים אחרים עם שם דומה.
החזר אובייקט JSON עם המפתחות הבאים:
- sources: מערך של מקורות ביקורת (Google Maps, Facebook וכו׳) עם rating, review_count, url
- weighted_average: ממוצע משוקלל של כל הביקורות (מספר)
- sentiment_score: ציון סנטימנט 0-100
- overallSentiment: "חיובי" / "מעורב" / "שלילי"
- positiveThemes: מערך נושאים חיוביים
- negativeThemes: מערך נושאים שליליים
- opportunities: מערך הזדמנויות לשיפור
- summary: סיכום קצר`

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      }
    )
    if (!res.ok) {
      console.error('[reviews] Gemini HTTP error:', res.status, await res.text())
      return null
    }
    const data = await res.json()
    if (data.error) {
      console.error('[reviews] Gemini API error:', JSON.stringify(data.error))
      return null
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    console.log('[reviews] raw Gemini text:', text.slice(0, 600))
    if (!text) {
      console.error('[reviews] empty Gemini response, data:', JSON.stringify(data).slice(0, 400))
      return null
    }
    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    const s = clean.indexOf('{'); const e = clean.lastIndexOf('}')
    if (s === -1 || e <= s) {
      console.error('[reviews] no JSON object found in:', clean.slice(0, 300))
      return null
    }
    let parsed: any
    try { parsed = JSON.parse(clean.slice(s, e + 1)) } catch (parseErr) {
      console.error('[reviews] JSON parse error:', parseErr, '| raw:', clean.slice(s, e + 1).slice(0, 300))
      return null
    }
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

    const phone: string | undefined = ctx.company?.phone || undefined

    // Try Google Places first (real data), fall back to Gemini
    const [placesData, geminiReviews] = await Promise.all([
      getPlaceDetails(companyName, website, phone),
      fetchReviewsWithGemini(companyName, domain),
    ])

    console.log('[reviews] places:', placesData ? `rating=${placesData.google_rating} reviews=${placesData.google_review_count}` : 'null')

    // Prefer Places for rating/count/URL; use Gemini for qualitative analysis
    const google_rating = placesData?.google_rating ?? geminiReviews?.google_rating ?? null
    const google_review_count = placesData?.google_review_count ?? geminiReviews?.google_review_count ?? null
    const google_maps_url = placesData?.google_maps_url ?? geminiReviews?.google_maps_url ?? null

    // Merge: if Places found real data, inject it as first source
    let sources = geminiReviews?.sources ?? []
    if (placesData?.google_rating != null) {
      const googleIdx = sources.findIndex((s: any) => (s.name || '').toLowerCase().includes('google'))
      const placesSource = {
        name: 'Google Maps',
        rating: placesData.google_rating,
        review_count: placesData.google_review_count,
        url: placesData.google_maps_url,
      }
      if (googleIdx >= 0) sources[googleIdx] = placesSource
      else sources = [placesSource, ...sources]
    }

    const result = {
      sources,
      weighted_average: geminiReviews?.weighted_average ?? google_rating,
      sentiment_score: geminiReviews?.sentiment_score ?? null,
      overallSentiment: geminiReviews?.overallSentiment ?? null,
      positiveThemes: geminiReviews?.positiveThemes ?? [],
      negativeThemes: geminiReviews?.negativeThemes ?? [],
      opportunities: geminiReviews?.opportunities ?? [],
      summary: geminiReviews?.summary ?? '',
      google_rating,
      google_review_count,
      google_maps_url,
      fetchedAt: new Date().toISOString(),
    }

    await ctx.supabase.from('companies').update({ review_analysis: result }).eq('id', ctx.user.id)

    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
