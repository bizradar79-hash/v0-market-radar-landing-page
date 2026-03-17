import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'
import type { MarketAnalysis } from '@/types/market-analysis'

export async function POST(request: Request) {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { analysis } = await request.json() as { analysis: MarketAnalysis }
    if (!analysis?.query) {
      return NextResponse.json({ error: 'Invalid analysis object' }, { status: 400 })
    }

    const { data: saved, error } = await ctx.supabase
      .from('market_analyses')
      .insert({
        company_id: ctx.user.id,
        query: analysis.query,
        region: analysis.region || 'כל ישראל',
        category: analysis.category || 'כללי',
        result: analysis,
      })
      .select('id')
      .single()

    if (error) {
      console.error('[save-market-analysis] error:', error.code, error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, id: saved?.id })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
