export const dynamic = 'force-dynamic'

const KEY = () => process.env.GOOGLE_PLACES_API_KEY ?? ''

export async function GET() {
  const out: Record<string, unknown> = { key_set: !!KEY() }

  // Step 1: Geocode the physical address
  const geocode = await (async () => {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent('שינקין 44, גבעתיים, ישראל')}&key=${KEY()}`
    )
    const d = await res.json()
    return { status: d.status, loc: d.results?.[0]?.geometry?.location, addr: d.results?.[0]?.formatted_address }
  })().catch(e => `error: ${e.message}`)
  out.geocode = geocode

  // Step 2: If we have coordinates, nearby search within 100m
  const loc = (geocode as any)?.loc
  if (loc?.lat && loc?.lng) {
    out.nearby_exact = await (async () => {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${loc.lat},${loc.lng}&radius=200&key=${KEY()}`
      )
      const d = await res.json()
      return { status: d.status, results: (d.results ?? []).slice(0, 10).map((r: any) => ({ name: r.name, rating: r.rating, count: r.user_ratings_total, id: r.place_id, types: r.types })) }
    })().catch(e => `error: ${e.message}`)

    // Also get details for any promising result
    out.nearby_exact_details = await (async () => {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${loc.lat},${loc.lng}&radius=200&key=${KEY()}`
      )
      const d = await res.json()
      const interesting = (d.results ?? []).filter((r: any) =>
        !r.types?.includes('route') && !r.types?.includes('premise') && !r.types?.includes('subpremise')
      ).slice(0, 5)

      return Promise.all(interesting.map(async (r: any) => {
        const det = await fetch(
          `https://maps.googleapis.com/maps/api/place/details/json?place_id=${r.place_id}&fields=name,rating,user_ratings_total,website,formatted_address&key=${KEY()}`
        ).then(x => x.json())
        return det.result ?? { name: r.name, id: r.place_id }
      }))
    })().catch(e => `error: ${e.message}`)
  }

  return Response.json(out)
}
