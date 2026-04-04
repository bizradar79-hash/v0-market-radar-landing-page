export const dynamic = 'force-dynamic'

const KEY = () => process.env.GOOGLE_PLACES_API_KEY ?? ''
const GKEY = () => process.env.GEMINI_API_KEY ?? ''

async function tsearch(q: string) {
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&key=${KEY()}`
  )
  const d = await res.json()
  return (d.results ?? []).slice(0, 3).map((r: any) => ({ name: r.name, rating: r.rating, count: r.user_ratings_total, id: r.place_id }))
}

async function v1search(q: string) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': KEY(),
      'X-Goog-FieldMask': 'places.displayName,places.rating,places.userRatingCount,places.websiteUri,places.id',
    },
    body: JSON.stringify({ textQuery: q, regionCode: 'IL' }),
  })
  const d = await res.json()
  return (d.places ?? []).slice(0, 3).map((p: any) => ({ name: p.displayName?.text, rating: p.rating, count: p.userRatingCount, website: p.websiteUri, id: p.id }))
}

export async function GET() {
  const out: Record<string, unknown> = { key_set: !!KEY() }

  // Try all variations of the app/platform name
  out.t1 = await tsearch('בסלון מה עושים היום')
  out.t2 = await tsearch('basalon מה עושים היום')
  out.t3 = await tsearch('בסלון אירועים ישראל')
  out.t4 = await tsearch('basalon israel platform')
  out.t5 = await tsearch('basalon.co.il')

  out.v1 = await v1search('בסלון מה עושים היום')
  out.v2 = await v1search('basalon events israel')
  out.v3 = await v1search('basalon.co.il israel')

  // Gemini search with the app name
  out.gemini_app_name = await (async () => {
    const prompt = `Search Google Maps for the Israeli business "בסלון - מה עושים היום" or "basalon.co.il". Find its Google Maps rating and review count. Return JSON: {"rating": X.X, "review_count": Y, "maps_url": "..."}`
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GKEY()}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ googleSearch: {} }],
        }),
      }
    )
    const d = await res.json()
    if (d.error) return { error: d.error }
    const text = d.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text ?? ''
    return { text: text.slice(0, 600) }
  })().catch(e => `error: ${e.message}`)

  return Response.json(out)
}
