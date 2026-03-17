import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'
import type { NicheOpportunityData, NicheStatus } from '@/types/niche-opportunity'

export async function PATCH(request: Request) {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { nicheId, status } = await request.json() as { nicheId: string; status: NicheStatus }
    if (!nicheId || !status) return NextResponse.json({ error: 'Missing nicheId or status' }, { status: 400 })

    const { data: company } = await ctx.supabase
      .from('companies').select('niche_opportunities').eq('id', ctx.user.id).single()

    const current = company?.niche_opportunities as NicheOpportunityData | null
    if (!current?.opportunities) return NextResponse.json({ error: 'No niche data found' }, { status: 404 })

    const updated: NicheOpportunityData = {
      ...current,
      opportunities: current.opportunities.map(o =>
        o.id === nicheId ? { ...o, status } : o
      ),
    }

    const { error } = await ctx.supabase
      .from('companies').update({ niche_opportunities: updated }).eq('id', ctx.user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
