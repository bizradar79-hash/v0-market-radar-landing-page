import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await getFullContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyName = ctx.company?.name || ''
  const city = ctx.company?.city || ''
  if (!companyName) {
    return NextResponse.json({ error: 'No company name', rating: null, reviewCount: 0, reviews: [] })
  }

  // Try Google Places API first if key exists
  const placesKey = process.env.GOOGLE_PLACES_API_KEY
  if (placesKey) {
    try {
      const searchQuery = encodeURIComponent(`${companyName} ${city}`)
      const searchRes = await fetch(
        `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${searchQuery}&language=he&key=${placesKey}`
      )
      if (searchRes.ok) {
        const searchData = await searchRes.json()
        const place = searchData.results?.[0]
        if (place) {
          const detailsRes = await fetch(
            `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=rating,user_ratings_total,reviews,formatted_address,formatted_phone_number,website&language=he&key=${placesKey}`
          )
          if (detailsRes.ok) {
            const detailsData = await detailsRes.json()
            const details = detailsData.result || {}
            return NextResponse.json({
              rating: details.rating || place.rating || null,
              reviewCount: details.user_ratings_total || place.user_ratings_total || 0,
              address: details.formatted_address || place.formatted_address || '',
              phone: details.formatted_phone_number || '',
              website: details.website || '',
              reviews: (details.reviews || []).slice(0, 3).map((r: any) => ({
                author: r.author_name || '',
                rating: r.rating || 0,
                text: r.text || '',
                time: r.relative_time_description || '',
              })),
              source: 'google',
            })
          }
        }
      }
    } catch (e: any) {
      console.warn('google-places API failed, falling back to Serper:', e?.message)
    }
  }

  // Serper fallback — extracts business info from knowledge graph / local results
  const serperKey = process.env.SERPER_API_KEY
  if (!serperKey) {
    return NextResponse.json({
      error: 'לא מוגדר מפתח Google Places API ולא Serper API',
      rating: null, reviewCount: 0, reviews: [], address: '', phone: '', website: '',
    })
  }

  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': serperKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: `${companyName} ${city}`, gl: 'il', hl: 'he', num: 5 }),
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Serper search failed', rating: null, reviewCount: 0, reviews: [] })
    }

    const data = await res.json()
    const kg = data.knowledgeGraph || {}
    const local: any = (data.localResults || [])[0] || {}

    // Extract rating
    const rating: number | null = kg.rating ?? local.rating ?? null

    // Extract review count
    let reviewCount = 0
    if (typeof local.ratingCount === 'number') {
      reviewCount = local.ratingCount
    } else if (typeof kg.ratingCount === 'string') {
      reviewCount = parseInt(kg.ratingCount.replace(/\D/g, '')) || 0
    }

    // Extract address
    const address = local.address
      || kg.attributes?.['כתובת']
      || kg.attributes?.['Address']
      || ''

    // Extract phone
    const phone = local.phone
      || kg.attributes?.['טלפון']
      || kg.attributes?.['Phone']
      || ''

    // Extract website
    const website = kg.website || local.website || ''

    return NextResponse.json({
      rating,
      reviewCount,
      reviews: [], // Serper doesn't expose individual review text
      address,
      phone,
      website,
      source: 'serper',
    })
  } catch (e: any) {
    console.error('google-places serper fallback error:', e?.message)
    return NextResponse.json({ error: e?.message, rating: null, reviewCount: 0, reviews: [] })
  }
}
