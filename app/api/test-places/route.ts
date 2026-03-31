import { NextResponse } from 'next/server'
import { getPlaceDetails } from '@/lib/google-places'

export const dynamic = 'force-dynamic'

export async function GET() {
  const key = process.env.GOOGLE_PLACES_API_KEY
  const result = await getPlaceDetails('בסלון', 'basalon.co.il')
  return NextResponse.json({
    key_exists: !!key,
    key_length: key?.length,
    result
  })
}
