import { getFullContext } from '@/lib/context'
import { analyzeWithAI } from '@/lib/ai'
import { multiSearch } from '@/lib/search'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const results = await multiSearch([
      `טרנדים ${ctx.company?.industry} ישראל 2026`,
      `${ctx.company?.industry} מגמות שוק ישראל`,
      `${ctx.company?.keywords?.[0]} טרנד ישראל`,
      `${ctx.company?.industry} growth trends Israel 2026`,
    ])

    const data = await analyzeWithAI(`
זהה 12 טרנדים עסקיים מהמידע:

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
    const { data: saved } = await ctx.supabase.from('trends').insert(
      data.trends.map((t: any) => ({ ...t, company_id: ctx.user.id }))
    ).select()

    return NextResponse.json({ success: true, trends: saved, count: saved?.length || 0 })
  } catch (error) {
    console.error('Generate trends error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
