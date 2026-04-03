export async function getPlaceDetails(businessName: string, website: string, phone?: string) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return null

  try {
    const domain = website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
    const firstWord = businessName.toLowerCase().split(' ')[0]

    // 1. Website-based search — unique per business, most precise
    const websiteRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(domain)}&fields=place_id,name,rating,user_ratings_total,website&key=${apiKey}`
    )
    const websiteData = await websiteRes.json()
    if (websiteData.status && websiteData.status !== 'OK' && websiteData.status !== 'ZERO_RESULTS') {
      console.error('[google-places] website search status:', websiteData.status, websiteData.error_message || '')
    }
    const match = websiteData.results?.find((r: any) =>
      r.website?.includes(domain) || r.name?.toLowerCase().includes(firstWord)
    )
    if (match?.place_id && match?.rating) {
      return {
        place_id: match.place_id,
        google_rating: match.rating,
        google_review_count: match.user_ratings_total ?? 0,
        google_maps_url: `https://www.google.com/maps/place/?q=place_id:${match.place_id}`,
      }
    }

    // 2. Text queries via textsearch
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
