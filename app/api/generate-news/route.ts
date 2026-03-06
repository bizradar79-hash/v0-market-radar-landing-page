import { getFullContext } from '@/lib/context'
import { analyzeWithAI } from '@/lib/ai'
import { multiSearch } from '@/lib/search'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const results = await multiSearch([
      `${ctx.company?.industry} חדשות ישראל 2026`,
      `${ctx.company?.name} חדשות`,
      `${ctx.company?.keywords?.[0]} ישראל חדשות`,
      `site:calcalist.co.il ${ctx.company?.industry}`,
      `site:themarker.com ${ctx.company?.industry}`,
      `site:globes.co.il ${ctx.company?.industry}`,
    ])

    const data = await analyzeWithAI(`
בחר 15 חדשות רלוונטיות מהמידע הבא:

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

    await ctx.supabase.from('news').delete().eq('company_id', ctx.user.id)
    const { data: saved } = await ctx.supabase.from('news').insert(
      data.news.map((n: any) => ({ ...n, company_id: ctx.user.id, published_at: new Date().toISOString() }))
    ).select()

    return NextResponse.json({ success: true, news: saved, count: saved?.length || 0 })
  } catch (error) {
    console.error('Generate news error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
