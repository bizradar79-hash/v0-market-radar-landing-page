export async function getPlaceDetails(businessName: string, website: string, phone?: string) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return null

  try {
    const domain = website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]

    // Try phone first — most accurate
    const queries: { input: string; inputtype: string }[] = []
    if (phone) queries.push({ input: phone, inputtype: 'phonenumber' })
    queries.push({ input: `${businessName} ${domain}`, inputtype: 'textquery' })
    queries.push({ input: businessName, inputtype: 'textquery' })

    for (const q of queries) {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(q.input)}&inputtype=${q.inputtype}&fields=place_id,name,rating,user_ratings_total&key=${apiKey}`
      )
      const data = await res.json()
      if (data.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        console.error('[google-places] status:', data.status, q.input, data.error_message || '')
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
