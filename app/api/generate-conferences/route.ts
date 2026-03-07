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
      `כנסים ${ctx.company?.industry} ישראל 2026`,
      `conferences ${ctx.company?.industry} Israel 2026`,
      `ועידה ${ctx.company?.industry} ישראל 2026`,
    ])
    steps.search = { ok: true, count: results.length }

    steps.ai = 'starting'
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
    const list = Array.isArray(data?.conferences) ? data.conferences : []
    steps.ai = { ok: true, count: list.length, keys: Object.keys(data || {}) }

    steps.db = 'starting'
    await ctx.supabase.from('conferences').delete().eq('company_id', ctx.user.id)
    const { data: saved, error: insertError } = await ctx.supabase.from('conferences').insert(
      list.map((c: any) => ({
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
      steps.db = { ok: false, error: insertError.message, code: insertError.code }
      return NextResponse.json({ error: 'DB insert failed', steps }, { status: 500 })
    }
    steps.db = { ok: true, saved: saved?.length }

    return NextResponse.json({ success: true, conferences: saved, count: saved?.length || 0, steps })
  } catch (e: any) {
    console.error('generate-conferences error:', e?.message)
    return NextResponse.json({ error: e?.message, stack: e?.stack?.split('\n').slice(0, 4), steps }, { status: 500 })
  }
}
