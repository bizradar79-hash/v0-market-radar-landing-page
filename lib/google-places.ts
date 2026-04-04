// Israel bounding box for location bias
const ISRAEL_BIAS = 'rectangle:29.5,34.2|33.4,35.9'

async function findplace(
  input: string,
  inputtype: 'textquery' | 'phonenumber',
  apiKey: string,
): Promise<any[] | null> {
  try {
    const url =
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
      `?input=${encodeURIComponent(input)}` +
      `&inputtype=${inputtype}` +
      `&fields=place_id,name,rating,user_ratings_total,website` +
      `&locationbias=${ISRAEL_BIAS}` +
      `&key=${apiKey}`
    const res = await fetch(url)
    const data = await res.json()
    if (data.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('[google-places] findplace status:', data.status, input, data.error_message || '')
    }
    return data.candidates || []
  } catch { return null }
}

export async function getPlaceDetails(businessName: string, website: string, phone?: string) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return null

  try {
    const domain = website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]

    // Strategies in priority order — findplacefromtext supports 'fields' including 'website'
    // (textsearch does NOT support fields — that was the root cause bug)
    const strategies: { input: string; type: 'textquery' | 'phonenumber' }[] = [
      { input: domain, type: 'textquery' },                        // domain alone — most unique
      { input: `${businessName} ${domain}`, type: 'textquery' },   // name + domain
      { input: businessName, type: 'textquery' },                   // name alone with Israel bias
    ]

    for (const s of strategies) {
      const candidates = await findplace(s.input, s.type, apiKey)
      if (!candidates?.length) continue

      // Prefer candidate whose website matches our domain
      const exact = candidates.find(c => c.website?.toLowerCase().includes(domain.toLowerCase()))
      const best = exact ?? candidates[0]

      if (best?.place_id && best?.rating != null) {
        console.log(`[google-places] strategy="${s.input}" matched: ${best.name} rating=${best.rating} website=${best.website ?? 'n/a'}`)
        return {
          place_id: best.place_id,
          google_rating: best.rating,
          google_review_count: best.user_ratings_total ?? 0,
          google_maps_url: `https://www.google.com/maps/place/?q=place_id:${best.place_id}`,
        }
      }
    }

    return null
  } catch { return null }
}
