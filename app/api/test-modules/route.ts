export const dynamic = 'force-dynamic'

import { getPlaceDetails } from '@/lib/google-places'

export async function GET() {
  const results: any = {}
  const key = process.env.GEMINI_API_KEY

  if (!key) {
    return Response.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 })
  }

  // Test 1: GEO query generation
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'פלטפורמה מקוונת לסדנאות ישראל — תן שאילתת חיפוש קצרה של 3-5 מילים בלבד' }] }],
        }),
      }
    )
    const data = await res.json()
    const text = (data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim()
    results.geo_query_test = text || 'no response'
    results.geo_query_length = text.length
    results.geo_query_valid = text.length >= 3 && text.length <= 50
    if (data?.error) results.geo_query_api_error = data.error
  } catch (e: any) { results.geo_query_error = e.message }

  // Test 2: Google Places API — direct call for basalon
  results.places_key_set = !!process.env.GOOGLE_PLACES_API_KEY
  results.reviews_places = await getPlaceDetails('בסלון', 'basalon.co.il', '050-687-1111')
    .then(r => r ?? 'null — no result')
    .catch(e => `error: ${e.message}`)

  // Test 3: Website-based textsearch — inspect top results for basalon.co.il
  results.reviews_website = await (async () => {
    const res = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=basalon.co.il&fields=place_id,name,rating,user_ratings_total,website&key=${process.env.GOOGLE_PLACES_API_KEY}`)
    const data = await res.json()
    return data.results?.slice(0, 3).map((r: any) => ({ name: r.name, rating: r.rating, count: r.user_ratings_total, website: r.website }))
  })().catch(e => `error: ${e.message}`)

  // Test 4: Direct Place ID lookup — known correct basalon Place ID
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=ChIJV7EbImX7RhQRecG312XfvXs&fields=name,rating,user_ratings_total&key=${process.env.GOOGLE_PLACES_API_KEY}`
    )
    const data = await res.json()
    results.reviews_direct = data.result ?? data
  } catch (e: any) { results.reviews_direct_error = e.message }

  return Response.json(results)
}
