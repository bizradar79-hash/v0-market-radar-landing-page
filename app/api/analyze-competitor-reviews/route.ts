export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { createClient } from '@/lib/supabase/server'
import { getPlaceDetails } from '@/lib/google-places'
import { NextResponse } from 'next/server'

// Reviews analysis is expensive (Google Places lookup + Place Details + Gemini).
// Cache it server-side for 30 days so re-opening a competitor — even in a new
// session — never re-fires those calls. Manual "רענן ביקורות" passes force=true.
const REVIEWS_CACHE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

async function fetchPlaceReviews(placeId: string): Promise<Array<{ text: string; rating: number; author: string }>> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey || placeId.startsWith('gemini_')) return []
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=reviews,rating,user_ratings_total&key=${apiKey}&language=he`
    const res = await fetch(url)
    const data = await res.json()
    if (data.status !== 'OK') {
      console.warn('[analyze-competitor-reviews] place details status:', data.status)
      return []
    }
    const reviews = (data.result?.reviews || []).slice(0, 10)
    return reviews.map((r: any) => ({ text: r.text || '', rating: r.rating || 0, author: r.author_name || '' }))
  } catch (e: any) {
    console.warn('[analyze-competitor-reviews] fetchPlaceReviews error:', e?.message)
    return []
  }
}

async function analyzeReviewsWithGemini(companyName: string, rating: number, reviewCount: number, reviews: Array<{ text: string; rating: number }>): Promise<any | null> {
  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey || reviews.length === 0) return null
  try {
    const prompt = `אתה יועץ עסקי. נתח את ביקורות הגוגל של "${companyName}" וספק תובנות מקצועיות.

דירוג: ${rating}/5 (${reviewCount} ביקורות)
ביקורות:
${reviews.map((r, i) => `${i + 1}. ${r.text}`).join('\n')}

החזר JSON בלבד:
{
  "sentiment_score": 0,
  "summary": "תמצית 2-3 משפטים",
  "positives": ["חוזק 1", "חוזק 2", "חוזק 3"],
  "negatives": ["חולשה 1", "חולשה 2"],
  "opportunities": ["הזדמנות לשיפור 1", "הזדמנות 2"],
  "recommended_response": "תגובה מומלצת לביקורות שליליות"
}

CRITICAL: Output ONLY raw JSON. No markdown. sentiment_score must be 0-100.`

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    const text: string = data.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text ?? ''
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const s = clean.indexOf('{')
    const e = clean.lastIndexOf('}')
    if (s === -1 || e <= s) return null
    return JSON.parse(clean.slice(s, e + 1))
  } catch (e: any) {
    console.warn('[analyze-competitor-reviews] Gemini analysis error:', e?.message)
    return null
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { competitorId, competitorName, competitorWebsite, force } = await request.json().catch(() => ({}))
    if (!competitorName) return NextResponse.json({ error: 'Missing competitorName' }, { status: 400 })

    // Scan-once cache (mirrors analyze-competitor): unless force, return the
    // saved reviews analysis when it exists and is < 30 days old.
    if (!force && competitorId) {
      const { data: rows } = await supabase
        .from('competitive_analysis')
        .select('data, created_at')
        .eq('company_id', user.id)
        .order('created_at', { ascending: false })
        .limit(40)
      const hit = (rows || []).find(
        (row: any) => row?.data?.competitor_id === competitorId && row?.data?.kind === 'reviews' && row?.data?.reviews
      )
      if (hit) {
        const age = Date.now() - new Date(hit.data.fetchedAt || hit.created_at).getTime()
        if (age < REVIEWS_CACHE_MS) {
          return NextResponse.json({ ...hit.data.reviews, cached: true })
        }
      }
    }

    const placesData = await getPlaceDetails(competitorName, competitorWebsite || '')

    const result: Record<string, any> = {
      success: true,
      google_rating: placesData?.google_rating ?? null,
      google_review_count: placesData?.google_review_count ?? null,
      google_maps_url: placesData?.google_maps_url ?? null,
    }

    // Fetch and analyze reviews if we have a real place_id
    if (placesData?.place_id && placesData.google_rating != null) {
      const reviews = await fetchPlaceReviews(placesData.place_id)
      if (reviews.length > 0) {
        result.review_texts = reviews.map(r => ({ text: r.text, rating: r.rating, author: r.author }))
        const analysis = await analyzeReviewsWithGemini(
          competitorName,
          placesData.google_rating,
          placesData.google_review_count ?? 0,
          reviews
        )
        if (analysis) {
          result.sentiment_score = analysis.sentiment_score ?? null
          result.summary = analysis.summary ?? null
          result.positives = analysis.positives ?? []
          result.negatives = analysis.negatives ?? []
          result.opportunities = analysis.opportunities ?? []
          result.recommended_response = analysis.recommended_response ?? null
        }
      }
    }

    // Persist server-side so later opens (even new sessions) read cached — no
    // recurring Places/Gemini cost. Manual upsert: drop prior reviews row(s) for
    // this competitor, then insert the fresh one (no duplicate accumulation).
    if (competitorId) {
      await supabase
        .from('competitive_analysis')
        .delete()
        .eq('company_id', user.id)
        .eq('data->>competitor_id', competitorId)
        .eq('data->>kind', 'reviews')
      await supabase.from('competitive_analysis').insert({
        company_id: user.id,
        data: {
          competitor_id: competitorId,
          kind: 'reviews',
          competitor_name: competitorName,
          reviews: result,
          fetchedAt: new Date().toISOString(),
        },
      })
    }

    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
