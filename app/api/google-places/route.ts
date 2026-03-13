import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await getFullContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GOOGLE_PLACES_API_KEY not set', rating: null, reviewCount: null, reviews: [] })
  }

  const companyName = ctx.company?.name || ''
  const city = ctx.company?.city || ''
  if (!companyName) {
    return NextResponse.json({ error: 'No company name', rating: null, reviewCount: null, reviews: [] })
  }

  try {
    // Text Search to find the place
    const searchQuery = encodeURIComponent(`${companyName} ${city}`)
    const searchRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${searchQuery}&language=he&key=${apiKey}`,
      { next: { revalidate: 3600 } }
    )
    if (!searchRes.ok) {
      return NextResponse.json({ error: 'Places search failed', rating: null, reviewCount: null, reviews: [] })
    }
    const searchData = await searchRes.json()
    const place = searchData.results?.[0]
    if (!place) {
      return NextResponse.json({ rating: null, reviewCount: null, reviews: [], message: 'עסק לא נמצא ב-Google' })
    }

    // Place Details for reviews
    const detailsRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=rating,user_ratings_total,reviews&language=he&key=${apiKey}`,
      { next: { revalidate: 3600 } }
    )
    if (!detailsRes.ok) {
      return NextResponse.json({ rating: place.rating || null, reviewCount: place.user_ratings_total || 0, reviews: [] })
    }
    const detailsData = await detailsRes.json()
    const details = detailsData.result || {}

    const reviews = (details.reviews || []).slice(0, 3).map((r: any) => ({
      author: r.author_name || '',
      rating: r.rating || 0,
      text: r.text || '',
      time: r.relative_time_description || '',
    }))

    return NextResponse.json({
      rating: details.rating || place.rating || null,
      reviewCount: details.user_ratings_total || place.user_ratings_total || 0,
      reviews,
    })
  } catch (e: any) {
    console.error('google-places error:', e?.message)
    return NextResponse.json({ error: e?.message, rating: null, reviewCount: null, reviews: [] })
  }
}
