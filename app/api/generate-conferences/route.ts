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
      `כנסים ${ctx.company?.industry} ישראל 2026`,
      `conferences ${ctx.company?.industry} Israel 2026`,
      `ועידה ${ctx.company?.industry} ישראל 2026`,
    ])

    const data = await analyzeWithAI(`מצא 10 כנסים ואירועים מהמידע הבא:

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
    const { data: saved, error: insertError } = await ctx.supabase.from('conferences').insert(
      data.conferences.map((c: any) => ({
        name: c.name,
        date: c.date,
        location: c.location,
        description: c.description,
        url: c.url,
        category: c.category,
        price: c.price,
        company_id: ctx.user.id,
      }))
    ).select()

    if (insertError) {
      console.error('Conferences insert error:', insertError)
    }

    return NextResponse.json({ success: true, conferences: saved, count: saved?.length || 0 })
  } catch (error) {
    console.error('Generate conferences error:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Failed', details: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
