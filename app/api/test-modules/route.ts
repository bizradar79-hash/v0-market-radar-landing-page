export const dynamic = 'force-dynamic'

const KEY = () => process.env.GOOGLE_PLACES_API_KEY ?? ''

async function tsearch(q: string) {
  // NO region param — was causing ZERO_RESULTS for Hebrew
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&locationbias=rectangle:29.5,34.2|33.4,35.9&key=${KEY()}`
  )
  const data = await res.json()
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS')
    return { status: data.status, error: data.error_message }
  return (data.results ?? []).slice(0, 5).map((r: any) => ({
    name: r.name, rating: r.rating, count: r.user_ratings_total, id: r.place_id,
  }))
}

async function details(id: string) {
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/place/details/json?place_id=${id}&fields=name,rating,user_ratings_total,website&key=${KEY()}`
  )
  const d = await res.json()
  return d.result ?? null
}

export async function GET() {
  const out: Record<string, unknown> = { key_set: !!KEY() }

  // 1. Broad search — top 5 results, validate each via details to get website
  for (const q of ['basalon', 'basalon ישראל', 'basalon.co.il', 'בסלון', 'בסלון אירועים']) {
    out[`q_${q}`] = await tsearch(q).catch(e => `error: ${e.message}`)
  }

  // 2. Take all place_ids from query "basalon" and get their websites
  const basalonSearch = await tsearch('basalon')
  if (Array.isArray(basalonSearch)) {
    out.basalon_with_websites = await Promise.all(
      basalonSearch.map(async (r: any) => {
        const d = await details(r.id)
        return { name: r.name, rating: r.rating, website: d?.website ?? null, id: r.id }
      })
    )
  }

  return Response.json(out)
}
