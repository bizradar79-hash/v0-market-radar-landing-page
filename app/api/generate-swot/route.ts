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

    const system = `You are a business strategy analyst. Analyze the company profile and return a SWOT analysis in Hebrew.`
    const user = `CRITICAL: Output ONLY JSON, no markdown.

Company: ${name}
Industry: ${industry}
Description: ${description}
Products/Services: ${products}
Target Customers: ${targetCustomers}
Geographic Area: ${geographicArea || city}

Return exactly this JSON structure:
{
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "weaknesses": ["weakness 1", "weakness 2", "weakness 3"],
  "opportunities": ["opportunity 1", "opportunity 2", "opportunity 3"],
  "threats": ["threat 1", "threat 2", "threat 3"]
}`

    steps.ai = 'starting'
    const raw = await analyzeWithAI(system, user)
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      steps.ai = { ok: false, error: 'no JSON in response' }
      return NextResponse.json({ error: 'AI returned no JSON', steps }, { status: 500 })
    }
    const swot = JSON.parse(jsonMatch[0])
    steps.ai = { ok: true }

    const { error: updateError } = await ctx.supabase
      .from('companies')
      .update({ swot })
      .eq('id', ctx.user.id)

    if (updateError) {
      steps.db = { ok: false, error: updateError.message }
      return NextResponse.json({ error: 'DB update failed', steps }, { status: 500 })
    }
    steps.db = { ok: true }

    return NextResponse.json({ success: true, swot, steps })
  } catch (e: any) {
    console.error('generate-swot error:', e?.message)
    return NextResponse.json({ error: e?.message, steps }, { status: 500 })
  }
}
