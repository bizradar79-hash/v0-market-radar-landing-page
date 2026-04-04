export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { getFullContext } from '@/lib/context'
import { getPlaceDetails } from '@/lib/google-places'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Find manual competitors with missing google_rating
    const { data: manualComps } = await ctx.supabase
      .from('competitors')
      .select('id, name, website, phone, threat_score')
      .eq('company_id', ctx.user.id)
      .eq('source', 'manual')
      .is('google_rating', null)

    if (!manualComps?.length) {
      return NextResponse.json({ success: true, updated: 0, skipped: 'no missing ratings' })
    }

    let updated = 0
    for (const comp of manualComps) {
      if (!comp.website) continue
      try {
        const result = await getPlaceDetails(comp.name, comp.website, comp.phone ?? undefined)
        if (!result) continue

        const updates: Record<string, any> = {
          google_rating: result.google_rating,
          google_review_count: result.google_review_count,
          google_maps_url: result.google_maps_url,
        }

        // Apply threat score bonus
        if (comp.threat_score != null) {
          let bonus = 0
          if (result.google_rating >= 4.5) bonus += 20
          else if (result.google_rating >= 4.0) bonus += 15
          else if (result.google_rating >= 3.5) bonus += 10
          if (result.google_review_count > 500) bonus += 10
          else if (result.google_review_count >= 100) bonus += 5
          updates.threat_score = Math.min(100, (comp.threat_score ?? 0) + bonus)
        }

        const { error } = await ctx.supabase
          .from('competitors').update(updates).eq('id', comp.id)
        if (!error) updated++
      } catch (err) {
        console.warn('[patch-manual-ratings] failed for', comp.name, ':', err)
      }
    }

    return NextResponse.json({ success: true, updated })
  } catch (e: any) {
    console.error('[patch-manual-ratings] error:', e?.message)
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
