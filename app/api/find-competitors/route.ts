import { getFullContext } from '@/lib/context'
import { analyzeWithAI } from '@/lib/ai'
import { multiSearch } from '@/lib/search'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const results = await multiSearch([
      `${ctx.company?.industry} חברות ישראל`,
      `מתחרים ${ctx.company?.name} ישראל`,
      `${ctx.company?.description?.slice(0, 80)} חברות ישראל`,
      `${ctx.company?.industry} suppliers ישראל`,
    ])

    const data = await analyzeWithAI(`
זהה 10 מתחרים ישראליים אמיתיים מהמידע הבא בלבד:

${ctx.context}

תוצאות חיפוש נוספות:
${results.map(r => `[${r.title}] ${r.url} - ${r.content}`).join('\n')}

כללים: 
- רק חברות שמופיעות בתוצאות החיפוש
- רק URLs אמיתיים שמופיעים במידע
- אל תמציא אף חברה

{
  "competitors": [{
    "name": "שם אמיתי",
    "website": "URL אמיתי מהחיפוש",
    "services": "שירותים לפי המידע",
    "reason": "למה מתחרים",
    "pricing": "מחירון אם ידוע",
    "threat_score": 75
  }]
}`)

    await ctx.supabase.from('competitors').delete().eq('company_id', ctx.user.id)
    const { data: saved } = await ctx.supabase.from('competitors').insert(
      data.competitors.map((c: any) => ({ ...c, company_id: ctx.user.id }))
    ).select()

    return NextResponse.json({ success: true, competitors: saved, count: saved?.length || 0 })
  } catch (error) {
    console.error('Find competitors error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
