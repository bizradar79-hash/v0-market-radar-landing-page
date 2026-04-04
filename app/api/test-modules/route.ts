export const dynamic = 'force-dynamic'

import { getPlaceDetails } from '@/lib/google-places'

// Diagnostic endpoint — test getPlaceDetails for any domain
// GET /api/test-modules?name=BusinessName&website=https://example.com
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const name = searchParams.get('name') || 'בסלון - basalon'
  const website = searchParams.get('website') || 'https://basalon.co.il'

  const result = await getPlaceDetails(name, website)
  return Response.json({ name, website, result })
}
