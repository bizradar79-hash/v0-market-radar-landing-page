export const dynamic = 'force-dynamic'

import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'

export const maxDuration = 60

async function fetchRatingWithGemini(competitorName: string): Promise<{
  google_rating: number | null
  google_review_count: number | null
} | null> {
  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) return null

  const prompt = `מה הדירוג של העסק "${competitorName}" בגוגל מאפס? כמה ביקורות יש לו?
החזר JSON בלבד: {"google_rating": X, "google_review_count": Y}
אם אינך יודע בוודאות — החזר {"google_rating": null, "google_review_count": null}`

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
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    const s = clean.indexOf('{'); const e = clean.lastIndexOf('}')
    if (s === -1 || e <= s) return null
    const parsed = JSON.parse(clean.slice(s, e + 1))
    const rating = typeof parsed.google_rating === 'number' ? parsed.google_rating : null
    return {
      // Reject implausibly low ratings (< 2.0 means data error, not a real score)
      google_rating: rating !== null && rating >= 2.0 ? rating : null,
      google_review_count: typeof parsed.google_review_count === 'number' ? parsed.google_review_count : null,
    }
  } catch { return null }
}

function applyThreatBonus(base: number, rating: number | null, reviewCount: number | null): number {
  let score = base
  if (rating != null) {
    if (rating >= 4.5) score += 20
    else if (rating >= 4.0) score += 15
    else if (rating >= 3.5) score += 10
  }
  if (reviewCount != null) {
    if (reviewCount > 500) score += 10
    else if (reviewCount >= 100) score += 5
  }
  return Math.min(100, score)
}

export async function POST(request: Request) {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { competitorId, name } = await request.json()
    if (!competitorId || !name) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

    const geminiResult = await fetchRatingWithGemini(name)

    // If Gemini returned null for both fields, don't overwrite existing data
    if (!geminiResult || (geminiResult.google_rating === null && geminiResult.google_review_count === null)) {
      return NextResponse.json({ success: true, rating: null, reviewCount: null, skipped: true })
    }

    const { google_rating: rating, google_review_count: reviewCount } = geminiResult
    const updates: Record<string, any> = {}

    // Only update non-null values
    if (rating !== null) updates.google_rating = rating
    if (reviewCount !== null) updates.google_review_count = reviewCount

    if (rating !== null) {
      const { data: comp } = await ctx.supabase
        .from('competitors').select('threat_score').eq('id', competitorId).eq('company_id', ctx.user.id).single()
      if (comp?.threat_score != null) {
        updates.threat_score = applyThreatBonus(comp.threat_score, rating, reviewCount)
      }
    }

    const { error: dbError } = await ctx.supabase
      .from('competitors').update(updates).eq('id', competitorId).eq('company_id', ctx.user.id)

    if (dbError) console.warn('fetch-competitor-rating DB save failed:', dbError.message)

    return NextResponse.json({ success: true, rating, reviewCount, threat_score: updates.threat_score ?? null })
  } catch (e: any) {
    console.error('fetch-competitor-rating error:', e?.message)
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
