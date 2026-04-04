export const dynamic = 'force-dynamic'

import { getPlaceDetails } from '@/lib/google-places'

const PLACES_KEY = () => process.env.GOOGLE_PLACES_API_KEY ?? ''
const ISRAEL_BIAS = 'rectangle:29.5,34.2|33.4,35.9'

const KNOWN_PLACE_ID = 'ChIJV7EbImX7RhQRecG312XfvXs'

interface RawCandidate {
  name?: string
  rating?: number
  user_ratings_total?: number
  website?: string
  place_id?: string
}

interface RawTextSearchResult {
  name?: string
  rating?: number
  user_ratings_total?: number
  place_id?: string
}

interface V1Place {
  displayName?: { text?: string }
  rating?: number
  userRatingCount?: number
  websiteUri?: string
  id?: string
}

export async function GET() {
  const results: Record<string, unknown> = { places_key_set: !!PLACES_KEY() }

  // ── Test A: Full getPlaceDetails for בסלון / basalon.co.il ────────────────
  results.A_getPlaceDetails = await (async () => {
    try {
      const result = await getPlaceDetails('בסלון', 'basalon.co.il')
      return result ?? 'null — no match found'
    } catch (e: unknown) {
      return `error: ${e instanceof Error ? e.message : String(e)}`
    }
  })()

  // ── Test B: Raw findplacefromtext with domain "basalon.co.il" ─────────────
  results.B_raw_findplace_domain = await (async () => {
    try {
      const url =
        `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
        `?input=${encodeURIComponent('basalon.co.il')}` +
        `&inputtype=textquery` +
        `&fields=place_id,name,rating,user_ratings_total,website` +
        `&locationbias=${ISRAEL_BIAS}` +
        `&key=${PLACES_KEY()}`
      const res = await fetch(url)
      const data = await res.json() as { status: string; candidates?: RawCandidate[]; error_message?: string }
      return {
        status: data.status,
        error_message: data.error_message,
        candidates: data.candidates?.map(c => ({
          name: c.name,
          rating: c.rating,
          user_ratings_total: c.user_ratings_total,
          website: c.website,
          place_id: c.place_id,
        })) ?? [],
      }
    } catch (e: unknown) {
      return `error: ${e instanceof Error ? e.message : String(e)}`
    }
  })()

  // ── Test C: Place Details with known Place ID ─────────────────────────────
  results.C_place_details_known_id = await (async () => {
    try {
      const url =
        `https://maps.googleapis.com/maps/api/place/details/json` +
        `?place_id=${KNOWN_PLACE_ID}` +
        `&fields=place_id,name,rating,user_ratings_total,website` +
        `&key=${PLACES_KEY()}`
      const res = await fetch(url)
      const data = await res.json() as { status: string; result?: Record<string, unknown>; error_message?: string }
      return {
        status: data.status,
        error_message: data.error_message,
        result: data.result
          ? {
              place_id: data.result.place_id,
              name: data.result.name,
              rating: data.result.rating,
              user_ratings_total: data.result.user_ratings_total,
              website: data.result.website,
            }
          : null,
      }
    } catch (e: unknown) {
      return `error: ${e instanceof Error ? e.message : String(e)}`
    }
  })()

  // ── Test D: Raw textsearch "basalon.co.il" — top 3 with place_ids ─────────
  results.D_raw_textsearch_domain = await (async () => {
    try {
      const url =
        `https://maps.googleapis.com/maps/api/place/textsearch/json` +
        `?query=${encodeURIComponent('basalon.co.il')}` +
        `&region=il` +
        `&key=${PLACES_KEY()}`
      const res = await fetch(url)
      const data = await res.json() as { status: string; results?: RawTextSearchResult[]; error_message?: string }
      return {
        status: data.status,
        error_message: data.error_message,
        top3: data.results?.slice(0, 3).map(r => ({
          name: r.name,
          rating: r.rating,
          user_ratings_total: r.user_ratings_total,
          place_id: r.place_id,
        })) ?? [],
      }
    } catch (e: unknown) {
      return `error: ${e instanceof Error ? e.message : String(e)}`
    }
  })()

  // ── Test E: Places v1 searchText "basalon.co.il" with websiteUri ──────────
  results.E_places_v1_searchText = await (async () => {
    try {
      const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': PLACES_KEY(),
          'X-Goog-FieldMask': 'places.displayName,places.rating,places.userRatingCount,places.websiteUri,places.id',
        },
        body: JSON.stringify({
          textQuery: 'basalon.co.il',
          languageCode: 'he',
          regionCode: 'IL',
        }),
      })
      const data = await res.json() as { places?: V1Place[]; error?: unknown }
      if (data.error) {
        return { error: data.error }
      }
      return {
        top3: data.places?.slice(0, 3).map(p => ({
          name: p.displayName?.text,
          rating: p.rating,
          count: p.userRatingCount,
          website: p.websiteUri,
          id: p.id,
        })) ?? [],
      }
    } catch (e: unknown) {
      return `error: ${e instanceof Error ? e.message : String(e)}`
    }
  })()

  return Response.json(results)
}
