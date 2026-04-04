export const dynamic = 'force-dynamic'

import { getPlaceDetails } from '@/lib/google-places'

export async function GET() {
  // Test the full getPlaceDetails pipeline for basalon.co.il
  // Expected: { google_rating: 3.0, google_review_count: 4 }
  const result = await getPlaceDetails('בסלון - basalon', 'https://basalon.co.il')

  return Response.json({
    result,
    rating_ok: result?.google_rating === 3.0,
    count_ok: result?.google_review_count === 4,
  })
}
