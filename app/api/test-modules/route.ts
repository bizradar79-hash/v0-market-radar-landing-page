export const dynamic = 'force-dynamic'

const KEY = () => process.env.GOOGLE_PLACES_API_KEY ?? ''

async function details(id: string) {
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/place/details/json?place_id=${id}&fields=name,rating,user_ratings_total,website,formatted_address,url&key=${KEY()}`
  )
  const d = await res.json()
  return { status: d.status, result: d.result ?? null }
}

async function tsearch(q: string, bias?: string) {
  const biasParam = bias ? `&locationbias=${bias}` : ''
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}${biasParam}&key=${KEY()}`
  )
  const data = await res.json()
  return (data.results ?? []).slice(0, 5).map((r: any) => ({
    name: r.name, rating: r.rating, count: r.user_ratings_total, id: r.place_id,
  }))
}

export async function GET() {
  const out: Record<string, unknown> = { key_set: !!KEY() }

  // Get full details for the candidate we found (rating:5, count:1)
  out.candidate_details = await details('ChIJFW6RO16dAhURCM70St7nFnw')

  // Search without any bias — wider net
  out.basalon_no_bias = await tsearch('basalon')
  out.basalon_israel_no_bias = await tsearch('basalon israel')
  out.basalon_events = await tsearch('basalon events platform')
  out.basalon_sadnaot = await tsearch('basalon סדנאות')

  // Places v1 — search variations
  const v1 = async (q: string) => {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': KEY(),
        'X-Goog-FieldMask': 'places.displayName,places.rating,places.userRatingCount,places.websiteUri,places.id',
      },
      body: JSON.stringify({ textQuery: q, languageCode: 'he', regionCode: 'IL' }),
    })
    const d = await res.json()
    return d.places?.slice(0, 5).map((p: any) => ({
      name: p.displayName?.text, rating: p.rating, count: p.userRatingCount, website: p.websiteUri, id: p.id,
    })) ?? d
  }

  out.v1_basalon = await v1('basalon')
  out.v1_basalon_israel = await v1('basalon ישראל')
  out.v1_basalon_events = await v1('basalon events')

  return Response.json(out)
}
