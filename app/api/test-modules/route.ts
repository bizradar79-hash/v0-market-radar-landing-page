export const dynamic = 'force-dynamic'

const KEY = () => process.env.GOOGLE_PLACES_API_KEY ?? ''

async function details(placeId: string) {
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=place_id,name,rating,user_ratings_total,website&key=${KEY()}`
  )
  const data = await res.json()
  return data.result ?? null
}

export async function GET() {
  const results: Record<string, unknown> = { key_set: !!KEY() }

  // Search "בסלון" — show top 10 results, validate each via place/details to get website
  results.search_basalon = await (async () => {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent('בסלון')}&region=il&key=${KEY()}`
    )
    const data = await res.json()
    if (data.status !== 'OK') return { status: data.status, error: data.error_message }
    const top10 = (data.results ?? []).slice(0, 10)
    // For each, fetch details to get website
    const enriched = await Promise.all(top10.map(async (r: any) => {
      const d = await details(r.place_id)
      return { name: r.name, rating: r.rating, count: r.user_ratings_total, place_id: r.place_id, website: d?.website ?? null }
    }))
    return enriched
  })().catch(e => `error: ${e.message}`)

  // Search "בסלון - basalon" specifically
  results.search_exact_name = await (async () => {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent('בסלון - basalon')}&region=il&key=${KEY()}`
    )
    const data = await res.json()
    if (data.status !== 'OK') return { status: data.status, error: data.error_message }
    const top5 = (data.results ?? []).slice(0, 5)
    const enriched = await Promise.all(top5.map(async (r: any) => {
      const d = await details(r.place_id)
      return { name: r.name, rating: r.rating, count: r.user_ratings_total, place_id: r.place_id, website: d?.website ?? null }
    }))
    return enriched
  })().catch(e => `error: ${e.message}`)

  // Places v1 — search "בסלון - basalon" with websiteUri
  results.v1_exact_name = await (async () => {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': KEY(),
        'X-Goog-FieldMask': 'places.displayName,places.rating,places.userRatingCount,places.websiteUri,places.id',
      },
      body: JSON.stringify({ textQuery: 'בסלון - basalon', languageCode: 'he', regionCode: 'IL' }),
    })
    const data = await res.json()
    if (data.error) return data.error
    return data.places?.slice(0, 5).map((p: any) => ({
      name: p.displayName?.text, rating: p.rating, count: p.userRatingCount, website: p.websiteUri, id: p.id,
    })) ?? []
  })().catch(e => `error: ${e.message}`)

  return Response.json(results)
}
