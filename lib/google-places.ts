export async function getPlaceDetails(businessName: string, website: string) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return null

  // Extract bare domain from URL if a full URL was passed
  let domain = website
  try {
    if (website.startsWith('http')) {
      domain = new URL(website).hostname.replace(/^www\./, '')
    } else if (website.includes('/')) {
      domain = website.split('/')[0].replace(/^www\./, '')
    }
  } catch { /* keep as-is */ }

  const queries = [
    businessName && domain ? `${businessName} ${domain}` : '',
    businessName,
    domain,
  ].filter(Boolean)

  try {
    for (const q of queries) {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(q)}&inputtype=textquery&fields=place_id,name,rating,user_ratings_total&locationbias=ipbias&key=${apiKey}`
      )
      const data = await res.json()
      console.log('Places query:', q, '→', JSON.stringify(data?.candidates?.[0]))
      const candidate = data.candidates?.[0]
      if (candidate?.place_id) {
        return {
          place_id: candidate.place_id,
          google_rating: candidate.rating ?? null,
          google_review_count: candidate.user_ratings_total ?? null,
          google_maps_url: `https://www.google.com/maps/place/?q=place_id:${candidate.place_id}`
        }
      }
    }
  } catch (e) {
    console.error('getPlaceDetails error:', e)
  }
  return null
}
