import { getFullContext } from '@/lib/context'
import { analyzeWithAI } from '@/lib/ai'
import { multiSearch } from '@/lib/search'
import { NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST() {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const results = await multiSearch([
      `טרנדים ${ctx.company?.industry} ישראל 2026`,
      `${ctx.company?.industry} מגמות שוק ישראל`,
      `${ctx.company?.industry} growth trends Israel 2026`,
    ])

    const data = await analyzeWithAI(`זהה 12 טרנדים עסקיים מהמידע:

${ctx.context}

תוצאות חיפוש:
${results.map(r => `[${r.title}] ${r.url} - ${r.content}`).join('\n')}

{
  "trends": [{
    "name": "שם טרנד",
    "description": "תיאור 2-3 משפטים",
    "score": 78,
    "direction": "up",
    "category": "קטגוריה",
    "sources": ["URL אמיתי"]
  }]
}`)

    await ctx.supabase.from('trends').delete().eq('company_id', ctx.user.id)
    const { data: saved, error: insertError } = await ctx.supabase.from('trends').insert(
      data.trends.map((t: any) => ({
        name: t.name,
        description: t.description,
        score: t.score,
        direction: t.direction,
        category: t.category,
        sources: t.sources,
        company_id: ctx.user.id,
      }))
    ).select()

    if (insertError) {
      console.error('Trends insert error:', insertError)
    }

    return NextResponse.json({ success: true, trends: saved, count: saved?.length || 0 })
  } catch (error) {
    console.error('Generate trends error:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Failed', details: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
