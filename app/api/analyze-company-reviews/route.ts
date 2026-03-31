export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { getFullContext } from '@/lib/context'
import { getPlaceDetails } from '@/lib/google-places'
import { NextResponse } from 'next/server'

const CACHE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export async function POST(request: Request) {
  try {
    const testKey = process.env.GOOGLE_PLACES_API_KEY
    console.log('PLACES_KEY_EXISTS:', !!testKey, 'KEY_LENGTH:', testKey?.length)
    try {
      const testFetch = await fetch(
        `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=basalon&inputtype=textquery&fields=place_id,name,rating,user_ratings_total&key=${testKey}`
      )
      const testData = await testFetch.json()
      console.log('PLACES_TEST_RESPONSE:', JSON.stringify(testData))
    } catch(e) {
      console.log('PLACES_TEST_ERROR:', e)
    }
  } catch(e) { /* ignore */ }

  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const force = new URL(request.url).searchParams.get('force') === 'true'
    if (!force) {
      const { data: company } = await ctx.supabase
        .from('companies').select('review_analysis').eq('id', ctx.user.id).single()
      const cached = company?.review_analysis as { fetchedAt?: string } | null
      if (cached?.fetchedAt) {
        const age = Date.now() - new Date(cached.fetchedAt).getTime()
        if (age < CACHE_MS) return NextResponse.json({ success: true, ...cached, cached: true })
      }
    }

    const companyName = ctx.company?.name || ''
    const website = ctx.company?.website || ''
    const domain = website
      ? (() => { try { return new URL(website.startsWith('http') ? website : `https://${website}`).hostname.replace(/^www\./, '') } catch { return website } })()
      : ''

    console.log('1. API key exists:', !!process.env.GOOGLE_PLACES_API_KEY)
    console.log('2. Company name:', companyName)
    console.log('3. Domain:', domain)

    if (!companyName) return NextResponse.json({ error: 'Missing company name' }, { status: 400 })

    const placeResult = await getPlaceDetails(companyName, domain)
    console.log('4. Places result:', JSON.stringify(placeResult))

    const result = {
      google_rating: placeResult?.google_rating ?? null,
      google_review_count: placeResult?.google_review_count ?? null,
      google_maps_url: placeResult?.google_maps_url ?? null,
      fetchedAt: new Date().toISOString(),
    }

    await ctx.supabase.from('companies').update({ review_analysis: result }).eq('id', ctx.user.id)

    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
