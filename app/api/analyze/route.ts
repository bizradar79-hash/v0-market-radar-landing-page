import { getFullContext } from '@/lib/context'
import { analyzeWithAI } from '@/lib/ai'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const data = await analyzeWithAI(`
בהתבסס על המידע האמיתי הבא, צור 10 הזדמנויות עסקיות עמוקות:

${ctx.context}

כל הזדמנות חייבת:
- להיות מבוססת על נתון אמיתי מהמידע שקיבלת
- לציין URL אמיתי שמופיע במידע לעיל בלבד
- להתייחס ספציפית למוצרים/שירותים של ${ctx.company?.name}
- לכלול 3 פעולות מעשיות שניתן לבצע תוך שבוע

{
  "opportunities": [{
    "title": "כותרת ספציפית",
    "description": "4-5 משפטים עם נתונים ספציפיים מהמידע",
    "impact_score": 90,
    "confidence_score": 85,
    "priority": "גבוהה",
    "type": "סוג הזדמנות",
    "actions": ["פעולה 1", "פעולה 2", "פעולה 3"],
    "sources": ["URL אמיתי מהמידע בלבד"]
  }]
}`)

    await ctx.supabase.from('opportunities').delete().eq('company_id', ctx.user.id)
    const { data: saved } = await ctx.supabase.from('opportunities').insert(
      data.opportunities.map((o: any) => ({ ...o, company_id: ctx.user.id }))
    ).select()
    
    await ctx.supabase.from('companies')
      .update({ last_analyzed: new Date().toISOString() })
      .eq('id', ctx.user.id)

    // Create alert
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
    console.error('Analyze error:', error)
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }
}
