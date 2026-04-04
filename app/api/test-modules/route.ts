export const dynamic = 'force-dynamic'

const KEY = () => process.env.GOOGLE_PLACES_API_KEY ?? ''

export async function GET() {
  const out: Record<string, unknown> = { key_set: !!KEY() }

  // 1. findplacefromtext with website URL as input
  out.find_by_website_url = await (async () => {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent('https://basalon.co.il')}&inputtype=textquery&fields=place_id,name,rating,user_ratings_total&key=${KEY()}`
    )
    const d = await res.json()
    return { status: d.status, candidates: d.candidates, error: d.error_message }
  })().catch(e => `error: ${e.message}`)

  // 2. findplacefromtext with phone number (international format)
  out.find_by_phone = await (async () => {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent('+972506871111')}&inputtype=phonenumber&fields=place_id,name,rating,user_ratings_total&key=${KEY()}`
    )
    const d = await res.json()
    return { status: d.status, candidates: d.candidates, error: d.error_message }
  })().catch(e => `error: ${e.message}`)

  // 3. Get details for phone-found place (including website to validate)
  const phoneRes = await fetch(
    `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent('+972506871111')}&inputtype=phonenumber&fields=place_id,name,rating,user_ratings_total&key=${KEY()}`
  ).then(r => r.json()).catch(() => null)
  const phoneId = phoneRes?.candidates?.[0]?.place_id
  out.phone_candidate_details = phoneId ? await (async () => {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${phoneId}&fields=place_id,name,rating,user_ratings_total,website,formatted_address,international_phone_number&key=${KEY()}`
    )
    const d = await res.json()
    return d.result ?? { status: d.status, error: d.error_message }
  })().catch(e => `error: ${e.message}`) : null

  // 4. Nearby search around Tel Aviv center with keyword "basalon"
  out.nearby_telaviv = await (async () => {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=32.0853,34.7818&radius=30000&keyword=basalon&key=${KEY()}`
    )
    const d = await res.json()
    return { status: d.status, results: (d.results ?? []).slice(0, 5).map((r: any) => ({ name: r.name, rating: r.rating, count: r.user_ratings_total, id: r.place_id })), error: d.error_message }
  })().catch(e => `error: ${e.message}`)

  // 5. Places v1 nearby search around Tel Aviv center
  out.v1_nearby_telaviv = await (async () => {
    const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': KEY(),
        'X-Goog-FieldMask': 'places.displayName,places.rating,places.userRatingCount,places.websiteUri,places.id',
      },
      body: JSON.stringify({
        textQuery: undefined,
        includedTypes: [],
        maxResultCount: 10,
        locationRestriction: {
          circle: {
            center: { latitude: 32.0853, longitude: 34.7818 },
            radius: 30000.0,
          },
        },
        rankPreference: 'DISTANCE',
      }),
    })
    const d = await res.json()
    // Filter for basalon in name
    const places = (d.places ?? []).filter((p: any) =>
      (p.displayName?.text ?? '').toLowerCase().includes('basalon') ||
      (p.displayName?.text ?? '').includes('בסלון')
    )
    return places.map((p: any) => ({ name: p.displayName?.text, rating: p.rating, count: p.userRatingCount, website: p.websiteUri, id: p.id }))
  })().catch(e => `error: ${e.message}`)

  // 6. Autocomplete: "basalon" — might find it even with low prominence
  out.autocomplete_basalon = await (async () => {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=basalon&components=country:il&types=establishment&key=${KEY()}`
    )
    const d = await res.json()
    return { status: d.status, predictions: (d.predictions ?? []).slice(0, 5).map((p: any) => ({ desc: p.description, id: p.place_id })), error: d.error_message }
  })().catch(e => `error: ${e.message}`)

  // 7. Autocomplete: "בסלון" (Hebrew)
  out.autocomplete_hebrew = await (async () => {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent('בסלון')}&components=country:il&types=establishment&language=he&key=${KEY()}`
    )
    const d = await res.json()
    return { status: d.status, predictions: (d.predictions ?? []).slice(0, 5).map((p: any) => ({ desc: p.description, id: p.place_id })), error: d.error_message }
  })().catch(e => `error: ${e.message}`)

  return Response.json(out)
}
