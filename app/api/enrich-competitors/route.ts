export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'

const PLACEHOLDER = 'מתחרה שזוהה בניתוח עסקי'

async function fetchDescriptionWithGemini(name: string): Promise<string | null> {
  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) return null
  const prompt = `תאר בקצרה (משפט אחד) מה העסק "${name}" מציע ללקוחותיו בישראל.`
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
    const text = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim()
    return text.length > 3 ? text : null
  } catch { return null }
}

async function fetchRatingWithGemini(name: string): Promise<{
  google_rating: number | null
  google_review_count: number | null
} | null> {
  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) return null
  const prompt = `מה הדירוג של העסק "${name}" בגוגל מאפס? כמה ביקורות יש לו?
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
    return {
      google_rating: typeof parsed.google_rating === 'number' ? parsed.google_rating : null,
      google_review_count: typeof parsed.google_review_count === 'number' ? parsed.google_review_count : null,
    }
  } catch { return null }
}

export async function POST() {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: competitors } = await ctx.supabase
      .from('competitors')
      .select('id, name, services, google_rating, google_review_count')
      .eq('company_id', ctx.user.id)

    if (!competitors || competitors.length === 0) {
      return NextResponse.json({ success: true, enriched: 0, message: 'No competitors found' })
    }

    let enriched = 0

    await Promise.all(competitors.map(async (comp: any) => {
      try {
        const needsDescription = !comp.services || comp.services === PLACEHOLDER
        const needsRating = comp.google_rating == null

        const [description, ratingData] = await Promise.all([
          needsDescription ? fetchDescriptionWithGemini(comp.name) : Promise.resolve(null),
          needsRating ? fetchRatingWithGemini(comp.name) : Promise.resolve(null),
        ])

        const updates: Record<string, any> = {}
        if (description) updates.services = description
        if (ratingData?.google_rating != null) updates.google_rating = ratingData.google_rating
        if (ratingData?.google_review_count != null) updates.google_review_count = ratingData.google_review_count

        if (Object.keys(updates).length > 0) {
          await ctx.supabase.from('competitors').update(updates).eq('id', comp.id).eq('company_id', ctx.user.id)
          enriched++
        }
      } catch { /* keep existing data */ }
    }))

    return NextResponse.json({ success: true, enriched, total: competitors.length })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
