import { analyzeWithAI } from '@/lib/ai'
import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST() {
  const steps: Record<string, any> = {}
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized', steps }, { status: 401 })
    steps.context = { ok: true, company: ctx.company?.name }

    const { name, industry, description, products, targetCustomers, geographicArea, city } = ctx.companyProfile

    const prompt = `You are a business strategy analyst. Analyze the following Israeli company and return a SWOT analysis in Hebrew.

Company: ${name}
Industry: ${industry}
Description: ${description || products}
Target Customers: ${targetCustomers}
Geographic Area: ${geographicArea || city}

Return ONLY this JSON (no markdown, no explanation):
{
  "strengths": ["חוזקה 1", "חוזקה 2", "חוזקה 3"],
  "weaknesses": ["חולשה 1", "חולשה 2", "חולשה 3"],
  "opportunities": ["הזדמנות 1", "הזדמנות 2", "הזדמנות 3"],
  "threats": ["איום 1", "איום 2", "איום 3"]
}`

    steps.ai = 'starting'
    const swot = await analyzeWithAI(prompt)
    if (!swot || !swot.strengths) {
      steps.ai = { ok: false, raw: JSON.stringify(swot) }
      return NextResponse.json({ error: 'AI returned invalid SWOT structure', steps }, { status: 500 })
    }
    steps.ai = { ok: true }

    // Save to DB — graceful if swot column doesn't exist yet
    const { error: updateError } = await ctx.supabase
      .from('companies')
      .update({ swot })
      .eq('id', ctx.user.id)

    if (updateError) {
      console.warn('generate-swot DB save failed:', updateError.message)
      steps.db = { ok: false, error: updateError.message }
      // Still return success with the swot data so the UI can display it
    } else {
      steps.db = { ok: true }
    }

    return NextResponse.json({ success: true, swot, steps })
  } catch (e: any) {
    console.error('generate-swot error:', e?.message)
    return NextResponse.json({ error: e?.message, steps }, { status: 500 })
  }
}
