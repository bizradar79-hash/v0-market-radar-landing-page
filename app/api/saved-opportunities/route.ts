import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await ctx.supabase
      .from('saved_opportunities')
      .select('*')
      .eq('company_id', ctx.user.id)
      .order('saved_at', { ascending: false })

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
      source_type, source_id, title, summary, description,
      revenue_potential_score, estimated_revenue_min, estimated_revenue_max,
      confidence_score, market_region, industry_tag,
    } = body

    if (!source_type || !source_id || !title) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Check for existing record (handles deduplication)
    const { data: existing } = await ctx.supabase
      .from('saved_opportunities')
      .select('*')
      .eq('company_id', ctx.user.id)
      .eq('source_type', source_type)
      .eq('source_id', source_id)
      .single()

    if (existing) {
      return NextResponse.json({ already_saved: true, data: existing })
    }

    const { data, error } = await ctx.supabase
      .from('saved_opportunities')
      .insert({
        company_id: ctx.user.id,
        source_type,
        source_id,
        title,
        summary: summary || '',
        description: description || '',
        revenue_potential_score: revenue_potential_score || 0,
        estimated_revenue_min: estimated_revenue_min || 0,
        estimated_revenue_max: estimated_revenue_max || 0,
        confidence_score: confidence_score || 0,
        market_region: market_region || '',
        industry_tag: industry_tag || '',
        status: 'חדש',
        user_notes: '',
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ already_saved: false, data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
