export const dynamic = 'force-dynamic'

const KEY = () => process.env.GOOGLE_PLACES_API_KEY ?? ''

async function tsearch(q: string) {
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&key=${KEY()}`
  )
  const d = await res.json()
  return (d.results ?? []).slice(0, 3).map((r: any) => ({ name: r.name, rating: r.rating, count: r.user_ratings_total, id: r.place_id, address: r.formatted_address }))
}

async function findplace(input: string, fields = 'place_id,name,rating,user_ratings_total') {
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(input)}&inputtype=textquery&fields=${fields}&locationbias=rectangle:31.5,34.0|32.5,35.5&key=${KEY()}`
  )
  const d = await res.json()
  return { status: d.status, candidates: d.candidates ?? [], error: d.error_message }
}

async function details(id: string) {
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/place/details/json?place_id=${id}&fields=place_id,name,rating,user_ratings_total,website,formatted_address&key=${KEY()}`
  )
  const d = await res.json()
  return d.result ?? { status: d.status, error: d.error_message }
}

export async function GET() {
  const out: Record<string, unknown> = { key_set: !!KEY() }

  // Physical address found on basalon.co.il/contact: שינקין 44, גבעתיים
  out.t_address = await tsearch('basalon שינקין 44 גבעתיים')
  out.t_givatayim = await tsearch('בסלון גבעתיים')
  out.t_shinkin = await tsearch('basalon shinkin givatayim')

  // findplacefromtext with address
  out.fp_address = await findplace('בסלון שינקין 44 גבעתיים')
  out.fp_basalon_giv = await findplace('basalon givatayim israel')

  // Nearby search around Givatayim (32.0705, 34.8120)
  out.nearby_givatayim = await (async () => {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=32.0705,34.8120&radius=500&keyword=basalon&key=${KEY()}`
    )
    const d = await res.json()
    return { status: d.status, results: (d.results ?? []).slice(0, 5).map((r: any) => ({ name: r.name, rating: r.rating, count: r.user_ratings_total, id: r.place_id })), error: d.error_message }
  })().catch(e => `error: ${e.message}`)

  out.nearby_givatayim_broader = await (async () => {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=32.0705,34.8120&radius=5000&keyword=basalon&key=${KEY()}`
    )
    const d = await res.json()
    return { status: d.status, results: (d.results ?? []).slice(0, 5).map((r: any) => ({ name: r.name, rating: r.rating, count: r.user_ratings_total, id: r.place_id })), error: d.error_message }
  })().catch(e => `error: ${e.message}`)

  // If any candidate found, get their full details
  const candidates: string[] = []
  const s1 = out.t_givatayim as any[]
  if (Array.isArray(s1) && s1[0]?.id) candidates.push(s1[0].id)
  const s2 = out.fp_address as any
  if (s2?.candidates?.[0]?.place_id) candidates.push(s2.candidates[0].place_id)

  out.candidate_details = await Promise.all(
    [...new Set(candidates)].slice(0, 3).map(id => details(id))
  )

  return Response.json(out)
}
