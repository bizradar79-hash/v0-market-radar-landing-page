import { getFullContext } from '@/lib/context'
import { analyzeWithAI } from '@/lib/ai'
import { multiSearch } from '@/lib/search'
import { NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST() {
  const steps: Record<string, any> = {}
  try {
    steps.context = 'starting'
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized', steps }, { status: 401 })
    steps.context = { ok: true, company: ctx.company?.name }

    steps.search = 'starting'
    const results = await multiSearch([
      `טרנדים ${ctx.company?.industry} ישראל 2026`,
      `${ctx.company?.industry} מגמות שוק ישראל`,
      `${ctx.company?.industry} growth trends Israel 2026`,
    ])
    steps.search = { ok: true, count: results.length }

    steps.ai = 'starting'
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
    const list = Array.isArray(data?.trends) ? data.trends : []
    steps.ai = { ok: true, count: list.length, keys: Object.keys(data || {}) }

    steps.db = 'starting'
    await ctx.supabase.from('trends').delete().eq('company_id', ctx.user.id)
    const { data: saved, error: insertError } = await ctx.supabase.from('trends').insert(
      list.map((t: any) => ({
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
      steps.db = { ok: false, error: insertError.message, code: insertError.code }
      return NextResponse.json({ error: 'DB insert failed', steps }, { status: 500 })
    }
    steps.db = { ok: true, saved: saved?.length }

    return NextResponse.json({ success: true, trends: saved, count: saved?.length || 0, steps })
  } catch (e: any) {
    console.error('generate-trends error:', e?.message)
    return NextResponse.json({ error: e?.message, stack: e?.stack?.split('\n').slice(0, 4), steps }, { status: 500 })
  }
}
