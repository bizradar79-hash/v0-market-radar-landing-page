import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'
import type { NicheOpportunity, NicheOpportunityData, NicheStatus } from '@/types/niche-opportunity'

// POST — append a new niche (created from market analysis) with status: 'tracking'
export async function POST(request: Request) {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { niche } = await request.json() as { niche: NicheOpportunity }
    if (!niche?.id || !niche?.nicheTitle) {
      return NextResponse.json({ error: 'Invalid niche object' }, { status: 400 })
    }

    console.log(`[niche-status] POST create nicheId=${niche.id} userId=${ctx.user.id}`)

    const { data: company, error: fetchError } = await ctx.supabase
      .from('companies').select('niche_opportunities').eq('id', ctx.user.id).single()

    if (fetchError) {
      console.error('[niche-status] fetch error:', fetchError.message)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    const current = company?.niche_opportunities as NicheOpportunityData | null
    const existing = current?.opportunities || []

    // Deduplicate by id
    const deduped = existing.filter((o: any) => String(o.id) !== String(niche.id))

    const updated: NicheOpportunityData = {
      fetchedAt: current?.fetchedAt || new Date().toISOString(),
      opportunities: [...deduped, { ...niche, status: 'tracking', source: 'market_analysis' }],
    }

    const { error: updateError } = await ctx.supabase
      .from('companies').update({ niche_opportunities: updated }).eq('id', ctx.user.id)

    if (updateError) {
      console.error('[niche-status] update error:', updateError.code, updateError.message)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    console.log(`[niche-status] POST success — nicheId=${niche.id} added as tracking`)
    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('[niche-status] POST unexpected error:', e?.message)
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { nicheId, status } = await request.json() as { nicheId: string; status: NicheStatus }
    if (!nicheId || !status) {
      return NextResponse.json({ error: 'Missing nicheId or status' }, { status: 400 })
    }

    console.log(`[niche-status] PATCH nicheId=${nicheId} status=${status} userId=${ctx.user.id}`)

    const { data: company, error: fetchError } = await ctx.supabase
      .from('companies').select('niche_opportunities').eq('id', ctx.user.id).single()

    if (fetchError) {
      console.error('[niche-status] fetch error:', fetchError.message)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    const current = company?.niche_opportunities as NicheOpportunityData | null

    // If no data in DB yet, optimistic client state is the source of truth — return success as no-op
    if (!current?.opportunities?.length) {
      console.warn('[niche-status] niche_opportunities empty/missing in DB — no-op, client state kept')
      return NextResponse.json({ success: true, noop: true })
    }

    // Use String() comparison in case JSONB deserializes numeric ids as numbers
    const found = current.opportunities.some(o => String(o.id) === String(nicheId))
    if (!found) {
      console.warn(`[niche-status] nicheId "${nicheId}" not found in opportunities array — no-op`)
      return NextResponse.json({ success: true, noop: true })
    }

    const updated: NicheOpportunityData = {
      ...current,
      opportunities: current.opportunities.map(o =>
        String(o.id) === String(nicheId) ? { ...o, status } : o
      ),
    }

    const { error: updateError } = await ctx.supabase
      .from('companies').update({ niche_opportunities: updated }).eq('id', ctx.user.id)

    if (updateError) {
      console.error('[niche-status] update error:', updateError.code, updateError.message)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    console.log(`[niche-status] success — nicheId=${nicheId} updated to "${status}"`)
    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('[niche-status] unexpected error:', e?.message)
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
