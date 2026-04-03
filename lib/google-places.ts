export async function getPlaceDetails(businessName: string, website: string, phone?: string) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return null

  try {
    const domain = website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]

    // 1. Phone lookup via findplacefromtext (most accurate)
    if (phone) {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(phone)}&inputtype=phonenumber&fields=place_id,name,rating,user_ratings_total&key=${apiKey}`
      )
      const data = await res.json()
      if (data.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        console.error('[google-places] phone status:', data.status, data.error_message || '')
      }
      const candidate = data.candidates?.[0]
      if (candidate?.place_id && candidate?.rating) {
        return {
          place_id: candidate.place_id,
          google_rating: candidate.rating,
          google_review_count: candidate.user_ratings_total ?? 0,
          google_maps_url: `https://www.google.com/maps/place/?q=place_id:${candidate.place_id}`,
        }
      }
    }

    // 2. Text queries via textsearch (more flexible than findplacefromtext)
    const textQueries = [
      `${businessName} ${domain}`,
      `${businessName} ישראל`,
    ]
    for (const q of textQueries) {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&key=${apiKey}`
      )
      const data = await res.json()
      if (data.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        console.error('[google-places] textsearch status:', data.status, q, data.error_message || '')
      }
      const result = data.results?.[0]
      if (result?.place_id && result?.rating) {
        return {
          place_id: result.place_id,
          google_rating: result.rating,
          google_review_count: result.user_ratings_total ?? 0,
          google_maps_url: `https://www.google.com/maps/place/?q=place_id:${result.place_id}`,
        }
      }
    }
    return null
  } catch { return null }
}
