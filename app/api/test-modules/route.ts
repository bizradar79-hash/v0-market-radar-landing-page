export const dynamic = 'force-dynamic'

const PLACES_KEY = () => process.env.GOOGLE_PLACES_API_KEY ?? ''
const ISRAEL_BIAS = 'rectangle:29.5,34.2|33.4,35.9'

async function rawFindplace(input: string, inputtype: string) {
  const url =
    `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
    `?input=${encodeURIComponent(input)}` +
    `&inputtype=${inputtype}` +
    `&fields=place_id,name,rating,user_ratings_total,website` +
    `&locationbias=${ISRAEL_BIAS}` +
    `&key=${PLACES_KEY()}`
  const res = await fetch(url)
  const data = await res.json()
  return { status: data.status, candidates: data.candidates?.map((c: any) => ({ name: c.name, rating: c.rating, count: c.user_ratings_total, website: c.website, id: c.place_id })) }
}

export async function GET() {
  const results: any = { places_key_set: !!PLACES_KEY() }

  // Strategy A: findplacefromtext with domain (root cause fix — fields includes website)
  results.A_domain = await rawFindplace('basalon.co.il', 'textquery').catch(e => `error: ${e.message}`)

  // Strategy B: findplacefromtext with name+domain
  results.B_name_domain = await rawFindplace('בסלון basalon.co.il', 'textquery').catch(e => `error: ${e.message}`)

  // Strategy C: findplacefromtext with name only + Israel bias
  results.C_name_only = await rawFindplace('בסלון', 'textquery').catch(e => `error: ${e.message}`)

  // Strategy D: Direct Place Details with known correct Place ID
  results.D_direct_id = await (async () => {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=ChIJV7EbImX7RhQRecG312XfvXs&fields=name,rating,user_ratings_total,website&key=${PLACES_KEY()}`
    )
    const data = await res.json()
    return { status: data.status, result: data.result }
  })().catch(e => `error: ${e.message}`)

  // Strategy E: Places API v1 (new) with websiteUri in field mask
  results.E_places_v1 = await (async () => {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': PLACES_KEY(),
        'X-Goog-FieldMask': 'places.displayName,places.rating,places.userRatingCount,places.websiteUri,places.id',
      },
      body: JSON.stringify({ textQuery: 'basalon.co.il', languageCode: 'he', regionCode: 'IL' }),
    })
    const data = await res.json()
    return data.places?.slice(0, 3).map((p: any) => ({
      name: p.displayName?.text, rating: p.rating, count: p.userRatingCount, website: p.websiteUri, id: p.id,
    })) ?? data
  })().catch(e => `error: ${e.message}`)

  return Response.json(results)
}
