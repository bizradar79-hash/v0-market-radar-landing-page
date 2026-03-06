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
      `${ctx.company?.industry} חדשות ישראל 2026`,
      `${ctx.company?.name} חדשות`,
      `site:calcalist.co.il ${ctx.company?.industry}`,
    ])

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

    await ctx.supabase.from('news').delete().eq('company_id', ctx.user.id)
    const { data: saved, error: insertError } = await ctx.supabase.from('news').insert(
      data.news.map((n: any) => ({
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
      console.error('News insert error:', insertError)
    }

    return NextResponse.json({ success: true, news: saved, count: saved?.length || 0 })
  } catch (error) {
    console.error('Generate news error:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Failed', details: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
