export const dynamic = 'force-dynamic'

const KEY = () => process.env.GOOGLE_PLACES_API_KEY ?? ''

// CID from the original Google Maps URL:
// !1s0x2466fb61221b2157:0x7bdf25d27e1b9971
// CID (hex) = 0x7bdf25d27e1b9971 → decimal:
const CID = BigInt('0x7bdf25d27e1b9971').toString()

export async function GET() {
  const out: Record<string, unknown> = { key_set: !!KEY(), cid: CID }

  // 1. place/details with cid as direct query param (legacy support)
  out.details_cid_param = await (async () => {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?cid=${CID}&fields=place_id,name,rating,user_ratings_total,website,url&key=${KEY()}`
    )
    const d = await res.json()
    return { status: d.status, result: d.result, error: d.error_message }
  })().catch(e => `error: ${e.message}`)

  // 2. place/details with place_id=cid:<decimal> format
  out.details_cid_prefix = await (async () => {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=cid:${CID}&fields=place_id,name,rating,user_ratings_total,website,url&key=${KEY()}`
    )
    const d = await res.json()
    return { status: d.status, result: d.result, error: d.error_message }
  })().catch(e => `error: ${e.message}`)

  // 3. Geocoding API with cid prefix
  out.geocode_cid = await (async () => {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?place_id=cid:${CID}&key=${KEY()}`
    )
    const d = await res.json()
    return { status: d.status, results: d.results?.slice(0, 2), error: d.error_message }
  })().catch(e => `error: ${e.message}`)

  // 4. Places v1 GET with cid prefix as resource name
  out.v1_cid_prefix = await (async () => {
    const res = await fetch(`https://places.googleapis.com/v1/places/cid:${CID}`, {
      headers: {
        'X-Goog-Api-Key': KEY(),
        'X-Goog-FieldMask': 'id,displayName,rating,userRatingCount,websiteUri,googleMapsUri',
      },
    })
    const d = await res.json()
    return d
  })().catch(e => `error: ${e.message}`)

  // 5. Old CID approach: place/details with the old Place ID (ChIJ...)
  out.old_id_details = await (async () => {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=ChIJV7EbImX7RhQRecG312XfvXs&fields=place_id,name,rating,user_ratings_total,website,url&key=${KEY()}`
    )
    const d = await res.json()
    return { status: d.status, result: d.result, error: d.error_message }
  })().catch(e => `error: ${e.message}`)

  // 6. Places v1 GET with old Place ID
  out.v1_old_id = await (async () => {
    const res = await fetch(`https://places.googleapis.com/v1/places/ChIJV7EbImX7RhQRecG312XfvXs`, {
      headers: {
        'X-Goog-Api-Key': KEY(),
        'X-Goog-FieldMask': 'id,displayName,rating,userRatingCount,websiteUri,googleMapsUri',
      },
    })
    const d = await res.json()
    return d
  })().catch(e => `error: ${e.message}`)

  // 7. Places v1 searchText with website URL
  out.v1_website_query = await (async () => {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': KEY(),
        'X-Goog-FieldMask': 'places.displayName,places.rating,places.userRatingCount,places.websiteUri,places.id',
      },
      body: JSON.stringify({ textQuery: 'basalon.co.il' }),
    })
    const d = await res.json()
    return d.places?.map((p: any) => ({ name: p.displayName?.text, rating: p.rating, count: p.userRatingCount, website: p.websiteUri, id: p.id })) ?? d
  })().catch(e => `error: ${e.message}`)

  // 8. Places v1 searchText: Hebrew name + event platform context
  out.v1_hebrew_events = await (async () => {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': KEY(),
        'X-Goog-FieldMask': 'places.displayName,places.rating,places.userRatingCount,places.websiteUri,places.id',
      },
      body: JSON.stringify({
        textQuery: 'בסלון פלטפורמה לאירועים',
        languageCode: 'he',
        regionCode: 'IL',
      }),
    })
    const d = await res.json()
    return d.places?.map((p: any) => ({ name: p.displayName?.text, rating: p.rating, count: p.userRatingCount, website: p.websiteUri, id: p.id })) ?? d
  })().catch(e => `error: ${e.message}`)

  return Response.json(out)
}
