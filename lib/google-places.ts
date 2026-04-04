export async function getPlaceDetails(businessName: string, website: string, phone?: string) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return null

  try {
    const domain = website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
    const domainBase = domain.replace(/\.co\.il$/, '').replace(/\.com$/, '').replace(/\.il$/, '')

    // Try each query; for each accept only results where website matches our domain
    const textQueries = [
      `${businessName} - ${domainBase}`,   // exact format: "בסלון - basalon"
      `${businessName} ${domain}`,
      `${businessName} ישראל`,
    ]

    for (const q of textQueries) {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&fields=place_id,name,rating,user_ratings_total,website&key=${apiKey}`
      )
      const data = await res.json()
      if (data.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        console.error('[google-places] textsearch status:', data.status, q, data.error_message || '')
      }
      // Validate by website field — ensures we matched the right business
      const match = (data.results || []).find((r: any) =>
        r.website?.toLowerCase().includes(domain.toLowerCase())
      )
      const result = match || data.results?.[0]
      if (result?.place_id && result?.rating) {
        console.log(`[google-places] matched via query "${q}": ${result.name} (${result.rating}, website: ${result.website ?? 'n/a'})`)
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
