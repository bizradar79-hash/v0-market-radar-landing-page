import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await ctx.supabase
      .from('ai_opportunities')
      .select('*')
      .eq('company_id', ctx.user.id)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, opportunities: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const {
      title, description, source_type,
      revenue_potential_score, estimated_revenue_min, estimated_revenue_max,
      market_demand_score, competition_score,
    } = body

    if (!title || !source_type) {
      return NextResponse.json({ error: 'Missing title or source_type' }, { status: 400 })
    }

    const { data, error } = await ctx.supabase
      .from('ai_opportunities')
      .insert({
        company_id: ctx.user.id,
        title,
        description: description || '',
        source_type,
        revenue_potential_score: revenue_potential_score || 0,
        estimated_revenue_min: estimated_revenue_min || 0,
        estimated_revenue_max: estimated_revenue_max || 0,
        market_demand_score: market_demand_score || 0,
        competition_score: competition_score || 0,
        status: 'חדש',
        notes: '',
        score_change: 0,
        last_ai_update: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, opportunity: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
