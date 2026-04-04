export const dynamic = 'force-dynamic'

import { getPlaceDetails } from '@/lib/google-places'

export async function GET() {
  const results: Record<string, unknown> = {}

  results.test_basisoren = await getPlaceDetails('בסיסי עץ האורן', 'basisoren.co.il', '03-504-0600')

  return Response.json({
    results,
    rating_ok: (results.test_basisoren as any)?.google_rating === 4.9,
    count_approx_ok: ((results.test_basisoren as any)?.google_review_count ?? 0) > 1000,
  })
}
