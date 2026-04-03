export async function getPlaceDetails(businessName: string, website: string) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return null
  try {
    const domain = website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
    const queries = [`${businessName} ${domain}`, businessName, domain]
    for (const q of queries) {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(q)}&inputtype=textquery&fields=place_id,name,rating,user_ratings_total&key=${apiKey}`
      )
      const data = await res.json()
      if (data.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        console.error('[google-places] API status:', data.status, data.error_message || '')
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
    return null
  } catch { return null }
}
