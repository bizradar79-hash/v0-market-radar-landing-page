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
  try {
    const placesResult = await getPlaceDetails('בסלון', 'basalon.co.il')
    results.reviews_places = placesResult ?? 'null — no result from Places API'
    results.places_key_set = !!process.env.GOOGLE_PLACES_API_KEY
  } catch (e: any) { results.reviews_places_error = e.message }

  return Response.json(results)
}
