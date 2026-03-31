export async function getPlaceDetails(businessName: string, website: string) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return null
  try {
    const query = encodeURIComponent(businessName)
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${query}&inputtype=textquery&fields=place_id,name,rating,user_ratings_total&key=${apiKey}`
    )
    const data = await res.json()
    const candidate = data.candidates?.[0]
    if (!candidate) return null
    return {
      place_id: candidate.place_id,
      google_rating: candidate.rating ?? null,
      google_review_count: candidate.user_ratings_total ?? null,
      google_maps_url: `https://www.google.com/maps/place/?q=place_id:${candidate.place_id}`
    }
  } catch { return null }
}
