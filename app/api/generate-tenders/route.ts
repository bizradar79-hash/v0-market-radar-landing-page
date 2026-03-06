import { getFullContext } from '@/lib/context'
import { analyzeWithAI } from '@/lib/ai'
import { multiSearch } from '@/lib/search'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const results = await multiSearch([
      `מכרזים ${ctx.company?.industry} ישראל 2026`,
      `site:mr.gov.il ${ctx.company?.industry}`,
      `מכרז ממשלתי ${ctx.company?.keywords?.[0]} 2026`,
      `tender ${ctx.company?.industry} Israel 2026`,
    ])

    const data = await analyzeWithAI(`
מצא 8 מכרזים רלוונטיים מהמידע הבא:

${ctx.context}

תוצאות חיפוש מכרזים:
${results.map(r => `[${r.title}] ${r.url} - ${r.content}`).join('\n')}

כללים:
- רק מכרזים שמופיעים בתוצאות החיפוש
- רק URLs אמיתיים
- דדליין ריאלי

{
  "tenders": [{
    "title": "כותרת מכרז",
    "organization": "ארגון",
    "deadline": "2026-05-01",
    "budget": "₪500,000",
    "description": "תיאור",
    "link": "URL אמיתי",
    "relevance_score": 88
  }]
}`)

    await ctx.supabase.from('tenders').delete().eq('company_id', ctx.user.id)
    const { data: saved } = await ctx.supabase.from('tenders').insert(
      data.tenders.map((t: any) => ({ ...t, company_id: ctx.user.id }))
    ).select()

    return NextResponse.json({ success: true, tenders: saved, count: saved?.length || 0 })
  } catch (error) {
    console.error('Generate tenders error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
