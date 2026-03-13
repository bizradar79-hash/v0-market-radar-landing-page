import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await getFullContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyName = ctx.company?.name || ''
  const city = ctx.company?.city || ''
  if (!companyName) {
    return NextResponse.json({ rating: null, reviewCount: 0, reviews: [], address: '', phone: '', website: '' })
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
            const result = {
              rating: details.rating || place.rating || null,
              reviewCount: details.user_ratings_total || place.user_ratings_total || 0,
              address: details.formatted_address || place.formatted_address || '',
              phone: details.formatted_phone_number || '',
              website: details.website || '',
              reviews: (details.reviews || []).map((r: any) => ({
                author: r.author_name || '',
                rating: r.rating || 0,
                text: r.text || '',
                time: r.relative_time_description || '',
              })),
              source: 'google',
            }
            // Persist to DB
            await ctx.supabase.from('companies').update({ geo_data: result }).eq('id', ctx.user.id)
            return NextResponse.json(result)
          }
        }
      }
    } catch (e: any) {
      console.warn('google-places API failed, falling back to Serper:', e?.message)
    }
  }

  // Serper fallback
  const serperKey = process.env.SERPER_API_KEY
  if (!serperKey) {
    return NextResponse.json({ rating: null, reviewCount: 0, reviews: [], address: '', phone: '', website: '' })
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
      return NextResponse.json({ rating: null, reviewCount: 0, reviews: [], address: '', phone: '', website: '' })
    }

    const data = await res.json()
    const kg = data.knowledgeGraph || {}
    const local: any = (data.localResults || [])[0] || {}

    const rating: number | null = kg.rating ?? local.rating ?? null

    let reviewCount = 0
    if (typeof local.ratingCount === 'number') {
      reviewCount = local.ratingCount
    } else if (typeof kg.ratingCount === 'string') {
      reviewCount = parseInt(kg.ratingCount.replace(/\D/g, '')) || 0
    } else if (typeof kg.ratingCount === 'number') {
      reviewCount = kg.ratingCount
    }

    const address = local.address || kg.attributes?.['כתובת'] || kg.attributes?.['Address'] || ''
    const phone = local.phone || kg.attributes?.['טלפון'] || kg.attributes?.['Phone'] || ''
    const website = kg.website || local.website || ''

    const rawReviews: any[] = Array.isArray(kg.reviews) ? kg.reviews : []
    const reviews = rawReviews
      .map((r: any) => ({
        author: r.author || r.user || r.name || '',
        rating: Number(r.rating) || 0,
        text: r.snippet || r.text || r.review || '',
        time: r.date || r.time || '',
      }))
      .filter((r) => r.text || r.author)

    const result = { rating, reviewCount, reviews, address, phone, website, source: 'serper' }

    // Persist to DB (graceful if geo_data column doesn't exist yet)
    const { error: dbError } = await ctx.supabase
      .from('companies')
      .update({ geo_data: result })
      .eq('id', ctx.user.id)
    if (dbError) console.warn('google-places DB save failed:', dbError.message)

    return NextResponse.json(result)
  } catch (e: any) {
    console.error('google-places serper fallback error:', e?.message)
    return NextResponse.json({ rating: null, reviewCount: 0, reviews: [], address: '', phone: '', website: '' })
  }
}
