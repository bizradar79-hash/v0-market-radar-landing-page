export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { getPlaceDetails } from '@/lib/google-places'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { competitorName, competitorWebsite } = await request.json().catch(() => ({}))
    if (!competitorName) return NextResponse.json({ error: 'Missing competitorName' }, { status: 400 })

    const placesData = await getPlaceDetails(competitorName, competitorWebsite || '')

    return NextResponse.json({
      success: true,
      google_rating: placesData?.google_rating ?? null,
      google_review_count: placesData?.google_review_count ?? null,
      google_maps_url: placesData?.google_maps_url ?? null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
