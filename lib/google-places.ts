// Israel bounding box for location bias
const ISRAEL_BIAS = 'rectangle:29.5,34.2|33.4,35.9'

interface PlaceCandidate {
  place_id?: string
  name?: string
  rating?: number
  user_ratings_total?: number
  website?: string
}

interface PlaceDetailsResult {
  place_id: string
  google_rating: number
  google_review_count: number
  google_maps_url: string
}

interface FindPlaceResponse {
  status: string
  candidates: PlaceCandidate[]
  error_message?: string
}

interface TextSearchResult {
  place_id: string
  name?: string
  rating?: number
  user_ratings_total?: number
}

interface TextSearchResponse {
  status: string
  results: TextSearchResult[]
  error_message?: string
}

interface PlaceDetailsResponse {
  status: string
  result?: {
    place_id?: string
    name?: string
    rating?: number
    user_ratings_total?: number
    website?: string
  }
  error_message?: string
}

async function findplacefromtext(
  input: string,
  apiKey: string,
): Promise<PlaceCandidate[]> {
  try {
    const url =
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
      `?input=${encodeURIComponent(input)}` +
      `&inputtype=textquery` +
      `&fields=place_id,name,rating,user_ratings_total,website` +
      `&locationbias=${ISRAEL_BIAS}` +
      `&key=${apiKey}`
    console.log(`[google-places] findplacefromtext input="${input}"`)
    const res = await fetch(url)
    const data: FindPlaceResponse = await res.json()
    if (data.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('[google-places] findplacefromtext status:', data.status, input, data.error_message ?? '')
    } else {
      console.log(`[google-places] findplacefromtext status=${data.status} candidates=${data.candidates?.length ?? 0}`)
    }
    return data.candidates ?? []
  } catch (err) {
    console.error('[google-places] findplacefromtext exception:', err)
    return []
  }
}

async function textsearch(
  query: string,
  apiKey: string,
): Promise<TextSearchResult[]> {
  try {
    const url =
      `https://maps.googleapis.com/maps/api/place/textsearch/json` +
      `?query=${encodeURIComponent(query)}` +
      `&region=il` +
      `&key=${apiKey}`
    console.log(`[google-places] textsearch query="${query}"`)
    const res = await fetch(url)
    const data: TextSearchResponse = await res.json()
    if (data.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('[google-places] textsearch status:', data.status, query, data.error_message ?? '')
    } else {
      console.log(`[google-places] textsearch status=${data.status} results=${data.results?.length ?? 0}`)
    }
    return data.results ?? []
  } catch (err) {
    console.error('[google-places] textsearch exception:', err)
    return []
  }
}

async function placeDetails(
  placeId: string,
  apiKey: string,
): Promise<PlaceDetailsResponse['result'] | null> {
  try {
    const url =
      `https://maps.googleapis.com/maps/api/place/details/json` +
      `?place_id=${encodeURIComponent(placeId)}` +
      `&fields=place_id,name,rating,user_ratings_total,website` +
      `&key=${apiKey}`
    console.log(`[google-places] placeDetails place_id="${placeId}"`)
    const res = await fetch(url)
    const data: PlaceDetailsResponse = await res.json()
    if (data.status && data.status !== 'OK') {
      console.error('[google-places] placeDetails status:', data.status, placeId, data.error_message ?? '')
      return null
    }
    return data.result ?? null
  } catch (err) {
    console.error('[google-places] placeDetails exception:', err)
    return null
  }
}

function buildResult(
  placeId: string,
  rating: number,
  userRatingsTotal: number,
): PlaceDetailsResult {
  return {
    place_id: placeId,
    google_rating: rating,
    google_review_count: userRatingsTotal,
    google_maps_url: `https://www.google.com/maps/place/?q=place_id:${placeId}`,
  }
}

export async function getPlaceDetails(
  businessName: string,
  website: string,
  _phone?: string,
): Promise<PlaceDetailsResult | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    console.error('[google-places] GOOGLE_PLACES_API_KEY not set')
    return null
  }

  try {
    const domain = website
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .toLowerCase()

    console.log(`[google-places] getPlaceDetails businessName="${businessName}" domain="${domain}"`)

    // ── Strategy 1: findplacefromtext with domain alone ──────────────────────
    console.log('[google-places] trying strategy 1: findplacefromtext(domain)')
    const s1Candidates = await findplacefromtext(domain, apiKey)
    for (const c of s1Candidates) {
      const websiteMatch = c.website?.toLowerCase().includes(domain)
      if (websiteMatch && c.place_id && c.rating != null) {
        console.log(`[google-places] strategy 1 HIT: ${c.name} rating=${c.rating} website=${c.website}`)
        return buildResult(c.place_id, c.rating, c.user_ratings_total ?? 0)
      }
    }
    console.log('[google-places] strategy 1 no website-matched candidate with rating')

    // ── Strategy 2: findplacefromtext with name + domain ─────────────────────
    console.log('[google-places] trying strategy 2: findplacefromtext(name+domain)')
    const s2Query = `${businessName} ${domain}`
    const s2Candidates = await findplacefromtext(s2Query, apiKey)
    for (const c of s2Candidates) {
      const websiteMatch = c.website?.toLowerCase().includes(domain)
      if ((websiteMatch || true) && c.place_id && c.rating != null) {
        // Accept first candidate that has a rating (website match preferred)
        if (websiteMatch) {
          console.log(`[google-places] strategy 2 HIT (website match): ${c.name} rating=${c.rating} website=${c.website}`)
          return buildResult(c.place_id, c.rating, c.user_ratings_total ?? 0)
        }
      }
    }
    // Second pass: accept first candidate with rating even without website match
    const s2Best = s2Candidates.find(c => c.place_id && c.rating != null)
    if (s2Best?.place_id && s2Best.rating != null) {
      console.log(`[google-places] strategy 2 HIT (first with rating): ${s2Best.name} rating=${s2Best.rating} website=${s2Best.website ?? 'n/a'}`)
      return buildResult(s2Best.place_id, s2Best.rating, s2Best.user_ratings_total ?? 0)
    }
    console.log('[google-places] strategy 2 no candidate with rating')

    // ── Strategy 3: textsearch(domain) → details for each to check website ───
    console.log('[google-places] trying strategy 3: textsearch(domain) + place/details')
    const s3Results = await textsearch(domain, apiKey)
    const s3Top5 = s3Results.slice(0, 5)
    for (const r of s3Top5) {
      if (!r.place_id) continue
      const details = await placeDetails(r.place_id, apiKey)
      if (!details) continue
      const websiteMatch = details.website?.toLowerCase().includes(domain)
      if (websiteMatch && details.rating != null) {
        console.log(`[google-places] strategy 3 HIT: ${details.name} rating=${details.rating} website=${details.website}`)
        return buildResult(r.place_id, details.rating, details.user_ratings_total ?? 0)
      }
    }
    console.log('[google-places] strategy 3 no website-matched result')

    // ── Strategy 4: textsearch(name + " ישראל") → details for each ───────────
    console.log('[google-places] trying strategy 4: textsearch(name+ישראל) + place/details')
    const s4Query = `${businessName} ישראל`
    const s4Results = await textsearch(s4Query, apiKey)
    const s4Top5 = s4Results.slice(0, 5)
    for (const r of s4Top5) {
      if (!r.place_id) continue
      const details = await placeDetails(r.place_id, apiKey)
      if (!details) continue
      const websiteMatch = details.website?.toLowerCase().includes(domain)
      if (websiteMatch && details.rating != null) {
        console.log(`[google-places] strategy 4 HIT: ${details.name} rating=${details.rating} website=${details.website}`)
        return buildResult(r.place_id, details.rating, details.user_ratings_total ?? 0)
      }
    }
    console.log('[google-places] strategy 4 no website-matched result')

    console.log('[google-places] all strategies exhausted — returning null')
    return null
  } catch (err) {
    console.error('[google-places] getPlaceDetails unexpected exception:', err)
    return null
  }
}
