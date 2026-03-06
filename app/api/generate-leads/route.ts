import { getFullContext } from '@/lib/context'
import { analyzeWithAI } from '@/lib/ai'
import { multiSearch } from '@/lib/search'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const results = await multiSearch([
      `${ctx.company?.industry} לקוחות קהל יעד ישראל`,
      `${ctx.company?.description?.slice(0, 80)} קונים ישראל`,
      `${ctx.company?.keywords?.[0]} ${ctx.company?.keywords?.[1]} חברות ישראל`,
      `חנויות ${ctx.company?.industry} ישראל`,
      `מפיצים ${ctx.company?.industry} ישראל`,
      `${ctx.company?.industry} B2B לקוחות עסקיים ישראל`,
    ])

    const data = await analyzeWithAI(`
מצא 20 לקוחות פוטנציאליים אמיתיים לחברה ${ctx.company?.name}.

${ctx.context}

תוצאות חיפוש:
${results.map(r => `[${r.title}] ${r.url} - ${r.content}`).join('\n')}

כללים:
- לקוחות = עסקים שיקנו מ-${ctx.company?.name} (לא מתחרים!)
- רק חברות שמופיעות בתוצאות החיפוש
- רק URLs אמיתיים
- אל תכלול את ${ctx.company?.name} עצמה
- גיוון: חנויות, מפיצים, עסקים, קליניקות - כל מי שיכול להשתמש במוצר

{
  "leads": [{
    "name": "שם חברה אמיתי",
    "website": "URL אמיתי",
    "industry": "תעשייה",
    "location": "עיר בישראל",
    "reason": "למה יקנו - ספציפי לפי המוצר",
    "score": 88,
    "source": "מקור"
  }]
}`)

    const filtered = data.leads.filter((l: any) =>
      l.name && l.website &&
      !l.name.includes(ctx.company?.name || '') &&
      l.website.startsWith('http')
    )

    await ctx.supabase.from('leads').delete().eq('company_id', ctx.user.id)
    const { data: saved } = await ctx.supabase.from('leads').insert(
      filtered.map((l: any) => ({ ...l, company_id: ctx.user.id }))
    ).select()

    // Create alert
    await ctx.supabase.from('alerts').insert({
      company_id: ctx.user.id,
      title: 'לידים חדשים התגלו',
      message: `${saved?.length || 0} לידים פוטנציאליים`,
      type: 'success',
      link: '/app/leads',
      is_read: false
    })

    return NextResponse.json({ success: true, count: saved?.length || 0 })
  } catch (error) {
    console.error('Generate leads error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
