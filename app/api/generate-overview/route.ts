import { analyzeWithAI } from '@/lib/ai'
import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST() {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { name, industry, description, products, targetCustomers, geographicArea, city } = ctx.companyProfile

    const prompt = `You are a professional business writer. Write a concise business overview in Hebrew (3-4 sentences) for the following company.

Company: ${name}
Industry: ${industry}
Products/Services: ${description || products}
Target customers: ${targetCustomers}
Geographic area: ${geographicArea || city}

Guidelines:
- Write in third person, formal Hebrew
- Cover: what the business does, who it serves, where it operates, a key strength
- Keep it factual based on the data provided

Return ONLY this JSON:
{"overview": "3-4 sentence overview in Hebrew here"}`

    const result = await analyzeWithAI(prompt)
    const overview: string = result?.overview || ''

    if (!overview) {
      return NextResponse.json({ error: 'AI returned no overview' }, { status: 500 })
    }

    // Save to DB — graceful if column doesn't exist yet
    const { error: dbError } = await ctx.supabase
      .from('companies')
      .update({ business_overview: overview })
      .eq('id', ctx.user.id)

    if (dbError) {
      console.warn('generate-overview DB save failed (column may not exist):', dbError.message)
    }

    return NextResponse.json({ success: true, overview })
  } catch (e: any) {
    console.error('generate-overview error:', e?.message)
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
