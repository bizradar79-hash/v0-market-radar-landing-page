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
      `${ctx.company?.industry} חדשות ישראל 2026`,
      `${ctx.company?.name} חדשות`,
      `site:calcalist.co.il ${ctx.company?.industry}`,
    ])
    steps.search = { ok: true, count: results.length }

    steps.ai = 'starting'
    const data = await analyzeWithAI(`בחר 15 חדשות רלוונטיות מהמידע הבא:

${ctx.context}

תוצאות חיפוש חדשות:
${results.map(r => `[${r.title}] ${r.url} - ${r.content}`).join('\n')}

כללים: רק URLs אמיתיים מהחיפוש

{
  "news": [{
    "title": "כותרת",
    "source": "שם מקור",
    "url": "URL אמיתי מהחיפוש",
    "category": "קטגוריה",
    "sentiment": "positive",
    "summary": "תקציר קצר"
  }]
}`)
    const list = Array.isArray(data?.news) ? data.news : []
    steps.ai = { ok: true, count: list.length, keys: Object.keys(data || {}) }

    steps.db = 'starting'
    await ctx.supabase.from('news').delete().eq('company_id', ctx.user.id)
    const { data: saved, error: insertError } = await ctx.supabase.from('news').insert(
      list.map((n: any) => ({
        title: n.title,
        source: n.source,
        url: n.url,
        category: n.category,
        sentiment: n.sentiment,
        summary: n.summary,
        company_id: ctx.user.id,
        published_at: new Date().toISOString(),
      }))
    ).select()
    if (insertError) {
      steps.db = { ok: false, error: insertError.message, code: insertError.code }
      return NextResponse.json({ error: 'DB insert failed', steps }, { status: 500 })
    }
    steps.db = { ok: true, saved: saved?.length }

    return NextResponse.json({ success: true, news: saved, count: saved?.length || 0, steps })
  } catch (e: any) {
    console.error('generate-news error:', e?.message)
    return NextResponse.json({ error: e?.message, stack: e?.stack?.split('\n').slice(0, 4), steps }, { status: 500 })
  }
}
