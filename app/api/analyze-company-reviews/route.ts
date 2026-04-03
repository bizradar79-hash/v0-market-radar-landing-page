export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'

const CACHE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

async function fetchReviewsWithGemini(companyName: string, domain: string): Promise<{
  google_rating: number | null
  google_review_count: number | null
  facebook_rating: number | null
  facebook_review_count: number | null
  google_maps_url: string | null
} | null> {
  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) return null

  const prompt = `חפש מידע על הביקורות של העסק "${companyName}" באתר ${domain}. מה הדירוג שלו בגוגל מאפס? כמה ביקורות יש לו? מה הדירוג בפייסבוק? החזר JSON בלבד: {"google_rating": null, "google_review_count": null, "facebook_rating": null, "facebook_review_count": null, "google_maps_url": null}`

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    )
    const data = await res.json()
    console.log('[reviews] Gemini raw:', JSON.stringify(data?.candidates?.[0]?.content?.parts?.[0]?.text))
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    const s = clean.indexOf('{'); const e = clean.lastIndexOf('}')
    if (s === -1 || e <= s) return null
    const parsed = JSON.parse(clean.slice(s, e + 1))
    return {
      google_rating: typeof parsed.google_rating === 'number' ? parsed.google_rating : null,
      google_review_count: typeof parsed.google_review_count === 'number' ? parsed.google_review_count : null,
      facebook_rating: typeof parsed.facebook_rating === 'number' ? parsed.facebook_rating : null,
      facebook_review_count: typeof parsed.facebook_review_count === 'number' ? parsed.facebook_review_count : null,
      google_maps_url: typeof parsed.google_maps_url === 'string' && parsed.google_maps_url.startsWith('http') ? parsed.google_maps_url : null,
    }
  } catch (e) {
    console.error('[reviews] Gemini error:', e)
    return null
  }
}

export async function POST(request: Request) {
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

    if (!companyName) return NextResponse.json({ error: 'Missing company name' }, { status: 400 })

    const reviews = await fetchReviewsWithGemini(companyName, domain)

    const result = {
      google_rating: reviews?.google_rating ?? null,
      google_review_count: reviews?.google_review_count ?? null,
      facebook_rating: reviews?.facebook_rating ?? null,
      facebook_review_count: reviews?.facebook_review_count ?? null,
      google_maps_url: reviews?.google_maps_url ?? null,
      fetchedAt: new Date().toISOString(),
    }

    await ctx.supabase.from('companies').update({ review_analysis: result }).eq('id', ctx.user.id)

    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
