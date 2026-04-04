export const dynamic = 'force-dynamic'

const KEY = () => process.env.GOOGLE_PLACES_API_KEY ?? ''

export async function GET() {
  const out: Record<string, unknown> = { key_set: !!KEY() }

  // Get lat/lng for "Sheinkin St 44, Giv'atayim" (ChIJeZty5bNLHRURjFc6gAW1Ki4 found earlier)
  out.givatayim_sheinkin_detail = await (async () => {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=ChIJeZty5bNLHRURjFc6gAW1Ki4&fields=geometry,formatted_address,name&key=${KEY()}`
    )
    const d = await res.json()
    return d.result ?? { status: d.status }
  })().catch(e => `error: ${e.message}`)

  const geom = (out.givatayim_sheinkin_detail as any)?.geometry?.location
  if (geom) {
    out.nearby_givatayim_sheinkin = await (async () => {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${geom.lat},${geom.lng}&radius=100&key=${KEY()}`
      )
      const d = await res.json()
      return {
        status: d.status,
        results: (d.results ?? []).map((r: any) => ({ name: r.name, rating: r.rating, count: r.user_ratings_total, id: r.place_id, types: r.types?.slice(0, 3) }))
      }
    })().catch(e => `error: ${e.message}`)

    out.nearby_givatayim_500m = await (async () => {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${geom.lat},${geom.lng}&radius=500&keyword=basalon&key=${KEY()}`
      )
      const d = await res.json()
      return { status: d.status, results: (d.results ?? []).slice(0, 5).map((r: any) => ({ name: r.name, rating: r.rating, count: r.user_ratings_total, id: r.place_id })) }
    })().catch(e => `error: ${e.message}`)
  }

  return Response.json(out)
}
