import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const key = process.env.GOOGLE_PLACES_API_KEY
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent('בסלון basalon.co.il')}&inputtype=textquery&fields=place_id,name,rating,user_ratings_total&key=${key}`
    )
    const data = await res.json()
    return NextResponse.json({ key_exists: !!key, key_length: key?.length, google_response: data })
  } catch(e: any) {
    return NextResponse.json({ key_exists: !!key, error: e.message })
  }
}
