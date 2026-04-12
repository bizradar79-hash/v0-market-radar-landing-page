export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { getFullContext } from '@/lib/context'
import { getPlaceDetails } from '@/lib/google-places'
import { NextResponse } from 'next/server'

const CACHE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

async function fetchPlaceReviews(placeId: string): Promise<Array<{ text: string; rating: number; author: string }>> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey || placeId.startsWith('gemini_')) return []
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=reviews,rating,user_ratings_total&key=${apiKey}&language=he`
    const res = await fetch(url)
    const data = await res.json()
    if (data.status !== 'OK') {
      console.warn('[analyze-company-reviews] place details status:', data.status)
      return []
    }
    const reviews = (data.result?.reviews || []).slice(0, 10)
    return reviews.map((r: any) => ({ text: r.text || '', rating: r.rating || 0, author: r.author_name || '' }))
  } catch (e: any) {
    console.warn('[analyze-company-reviews] fetchPlaceReviews error:', e?.message)
    return []
  }
}

async function analyzeReviewsWithGemini(companyName: string, rating: number, reviewCount: number, reviews: Array<{ text: string; rating: number }>): Promise<any | null> {
  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) return null

  // Build prompt — use real reviews if available, otherwise base analysis on rating alone
  const hasReviews = reviews.length > 0
  const reviewLines = reviews.slice(0, 10).map((r, i) => `${i + 1}. ${r.text}`).join('\n')
  const prompt = hasReviews
    ? `אתה יועץ עסקי. נתח את ביקורות הגוגל של "${companyName}" וספק תובנות מקצועיות.\n\nדירוג: ${rating}/5 (${reviewCount} ביקורות)\nביקורות:\n${reviewLines}\n\nהחזר JSON בלבד:\n{"sentiment_score":0,"summary":"תמצית 2-3 משפטים","positives":["חוזק 1","חוזק 2","חוזק 3"],"negatives":["חולשה 1","חולשה 2"],"opportunities":["הזדמנות לשיפור 1","הזדמנות 2"],"recommended_response":"תגובה מומלצת לביקורות שליליות"}\n\nCRITICAL: Output ONLY raw JSON. No markdown. sentiment_score must be 0-100.`
    : `אתה יועץ עסקי. נתח את המוניטין הגוגל של "${companyName}" על בסיס הדירוג הממוצע.\n\nדירוג: ${rating}/5 (${reviewCount} ביקורות בגוגל מאפס)\n\nהחזר JSON בלבד:\n{"sentiment_score":0,"summary":"תמצית 2-3 משפטים על המוניטין","positives":["חוזק 1","חוזק 2","חוזק 3"],"negatives":["חולשה 1","חולשה 2"],"opportunities":["הזדמנות לשיפור 1","הזדמנות 2"],"recommended_response":"המלצה לניהול מוניטין מקוון"}\n\nCRITICAL: Output ONLY raw JSON. No markdown. sentiment_score must be 0-100.`

  try {
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
    console.warn('[analyze-company-reviews] Gemini analysis error:', e?.message)
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

    // Load full company data for phone + city fallback
    const { data: companyRow } = await ctx.supabase
      .from('companies')
      .select('name, website, phone, city, business_profile')
      .eq('id', ctx.user.id)
      .single()

    const companyName = companyRow?.name || ctx.company?.name || ''
    const website = companyRow?.website || ctx.company?.website || ''
    const bp = companyRow?.business_profile as any
    const phone: string | undefined =
      companyRow?.phone || bp?.phone || ctx.company?.phone || undefined
    const city: string | undefined = companyRow?.city || undefined

    if (!companyName) return NextResponse.json({ error: 'Missing company name' }, { status: 400 })

    // Build name variations to try (handles lawyers, professionals, reversed name order)
    const nameParts = companyName.replace(/^(משרד |עורך דין |רואה חשבון |מהנדס )/u, '').trim()
    const searchVariants = [
      companyName,                                // e.g. "עורך דין דרור הראל"
      nameParts,                                  // e.g. "דרור הראל"
      city ? `${companyName} ${city}` : null,     // + city
      city ? `${nameParts} ${city}` : null,       // short name + city
      `${nameParts} עורך דין`,                   // short name + profession
      `משרד עורך דין ${nameParts}`,              // office prefix
    ].filter(Boolean) as string[]

    let placesData = null
    for (const variant of searchVariants) {
      console.log(`[analyze-company-reviews] trying: name="${variant}" website="${website}"`)
      placesData = await getPlaceDetails(variant, website, phone)
      if (placesData) {
        console.log(`[analyze-company-reviews] HIT with variant="${variant}" rating=${placesData.google_rating}`)
        break
      }
    }

    console.log(`[analyze-company-reviews] final: place_id=${placesData?.place_id ?? 'none'} rating=${placesData?.google_rating ?? 'none'}`)

    // Build Google search fallback URL
    const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(companyName + (website ? ' ' + website : ''))}`

    const result: Record<string, any> = {
      google_rating: placesData?.google_rating ?? null,
      google_review_count: placesData?.google_review_count ?? null,
      google_maps_url: placesData?.google_maps_url ?? null,
      not_found: !placesData,
      google_search_url: googleSearchUrl,
      fetchedAt: new Date().toISOString(),
    }

    // Fetch reviews + run AI analysis whenever we have a rating (with or without review texts)
    if (placesData?.place_id && placesData.google_rating != null) {
      const reviews = await fetchPlaceReviews(placesData.place_id)
      if (reviews.length > 0) {
        result.review_texts = reviews.map(r => ({ text: r.text, rating: r.rating, author: r.author }))
      }
      console.log(`[analyze-company-reviews] reviews fetched: ${reviews.length}, running AI analysis`)
      // Run Gemini analysis — works with real reviews OR from rating alone as fallback
      const analysis = await analyzeReviewsWithGemini(
        companyName,
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

    await ctx.supabase.from('companies').update({ review_analysis: result }).eq('id', ctx.user.id)

    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
