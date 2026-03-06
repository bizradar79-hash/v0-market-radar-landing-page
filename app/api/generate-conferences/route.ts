import { getFullContext } from '@/lib/context'
import { analyzeWithAI } from '@/lib/ai'
import { multiSearch } from '@/lib/search'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const results = await multiSearch([
      `כנסים ${ctx.company?.industry} ישראל 2026`,
      `אירועים ${ctx.company?.keywords?.[0]} ישראל 2026`,
      `conferences ${ctx.company?.industry} Israel 2026`,
      `ועידה ${ctx.company?.industry} ישראל 2026`,
    ])

    const data = await analyzeWithAI(`
מצא 10 כנסים ואירועים מהמידע הבא:

${ctx.context}

תוצאות חיפוש:
${results.map(r => `[${r.title}] ${r.url} - ${r.content}`).join('\n')}

כללים: רק כנסים שמופיעים בחיפוש עם URLs אמיתיים

{
  "conferences": [{
    "name": "שם כנס אמיתי",
    "date": "תאריך",
    "location": "מיקום",
    "description": "תיאור",
    "url": "URL אמיתי",
    "category": "קטגוריה",
    "price": "מחיר"
  }]
}`)

    await ctx.supabase.from('conferences').delete().eq('company_id', ctx.user.id)
    const { data: saved } = await ctx.supabase.from('conferences').insert(
      data.conferences.map((c: any) => ({ ...c, company_id: ctx.user.id }))
    ).select()

    return NextResponse.json({ success: true, conferences: saved, count: saved?.length || 0 })
  } catch (error) {
    console.error('Generate conferences error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
