import { getFullContext } from '@/lib/context'
import { analyzeWithAI } from '@/lib/ai'
import { multiSearch } from '@/lib/search'
import { NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST() {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Targeted searches for opportunities
    const searchResults = await multiSearch([
      `${ctx.company?.industry} הזדמנויות שוק ישראל 2026`,
      `${ctx.company?.name} ${ctx.company?.industry} ישראל`,
      `${ctx.company?.keywords?.slice(0, 2)?.join(' ')} ישראל`,
    ])

    const data = await analyzeWithAI(`בהתבסס על המידע הבא, צור 10 הזדמנויות עסקיות:

${ctx.context}

תוצאות חיפוש:
${searchResults.map(r => `[${r.title}] ${r.url} - ${r.content}`).join('\n')}

כל הזדמנות:
- מבוססת על נתון אמיתי מהמידע
- כוללת URL אמיתי מהחיפוש
- מתייחסת ל-${ctx.company?.name}
- כוללת 3 פעולות מעשיות לשבוע

{
  "opportunities": [{
    "title": "כותרת ספציפית",
    "description": "4-5 משפטים עם נתונים",
    "impact_score": 90,
    "confidence_score": 85,
    "priority": "גבוהה",
    "type": "סוג הזדמנות",
    "actions": ["פעולה 1", "פעולה 2", "פעולה 3"],
    "sources": ["URL אמיתי מהחיפוש"]
  }]
}`)

    await ctx.supabase.from('opportunities').delete().eq('company_id', ctx.user.id)
    const { data: saved, error: insertError } = await ctx.supabase.from('opportunities').insert(
      data.opportunities.map((o: any) => ({
        title: o.title,
        description: o.description,
        impact_score: o.impact_score,
        confidence_score: o.confidence_score,
        priority: o.priority,
        type: o.type,
        actions: o.actions,
        sources: o.sources,
        company_id: ctx.user.id,
      }))
    ).select()

    if (insertError) {
      console.error('Opportunities insert error:', insertError)
    }

    await ctx.supabase.from('companies')
      .update({ last_analyzed: new Date().toISOString() })
      .eq('id', ctx.user.id)

    await ctx.supabase.from('alerts').insert({
      company_id: ctx.user.id,
      title: 'הזדמנויות חדשות זוהו',
      message: `${data.opportunities.length} הזדמנויות חדשות התגלו`,
      type: 'info',
      link: '/app/opportunities',
      is_read: false
    })

    return NextResponse.json({ success: true, count: saved?.length || 0 })
  } catch (error) {
    console.error('Analyze error:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Analysis failed', details: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
