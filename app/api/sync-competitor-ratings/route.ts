export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { getFullContext } from '@/lib/context'
import { getPlaceDetails } from '@/lib/google-places'
import { ScanCostCollector } from '@/lib/scan/cost-tracker'
import { NextResponse } from 'next/server'

// Sync Google ratings for ALL competitors missing google_rating (manual + auto)
export async function POST() {
  let cost: ScanCostCollector | null = null
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    cost = new ScanCostCollector(ctx.user.id, 'competitor_ratings')

    // FIX 2 — only competitors that don't already have a cached rating, and
    // CAP at 7 (highest threat first) so a long competitor list can't fan out
    // into hundreds of Google Places calls. Each getPlaceDetails is expensive.
    const COMPETITOR_RATING_CAP = 7
    const { data: allComps } = await ctx.supabase
      .from('competitors')
      .select('id, name, website, phone, source, threat_score')
      .eq('company_id', ctx.user.id)
      .is('google_rating', null)
      .order('threat_score', { ascending: false, nullsFirst: false })

    const comps = (allComps ?? []).slice(0, COMPETITOR_RATING_CAP)

    if (!comps.length) {
      await cost.flush()
      return NextResponse.json({ success: true, updated: 0, skipped: 'all ratings present' })
    }

    let updated = 0
    for (const comp of comps) {
      try {
        const result = await getPlaceDetails(comp.name, comp.website || '', comp.phone ?? undefined, cost ?? undefined)
        if (!result) continue

        const isManual = comp.source === 'manual'
        let newScore: number | null = null
        if (comp.threat_score != null) {
          let base = comp.threat_score
          if (isManual) base = Math.min(100, base + 15)
          const r = result.google_rating
          const rc = result.google_review_count
          if (r != null) {
            if (r >= 4.5) base += 20
            else if (r >= 4.0) base += 15
            else if (r >= 3.5) base += 10
          }
          if (rc != null) {
            if (rc > 500) base += 10
            else if (rc >= 100) base += 5
          }
          newScore = Math.min(100, base)
        }

        const updates: Record<string, any> = {
          google_rating: result.google_rating,
          google_review_count: result.google_review_count,
          google_maps_url: result.google_maps_url,
        }
        if (newScore !== null) updates.threat_score = newScore

        await ctx.supabase.from('competitors').update(updates).eq('id', comp.id)
        updated++
        console.log(`[sync-competitor-ratings] updated ${comp.name}: rating=${result.google_rating}`)
      } catch (e: any) {
        console.warn(`[sync-competitor-ratings] failed for ${comp.name}:`, e?.message)
      }
    }

    await cost.flush()
    return NextResponse.json({ success: true, updated, total: comps.length, capped: (allComps?.length ?? 0) > comps.length })
  } catch (e: any) {
    await cost?.flush()
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
