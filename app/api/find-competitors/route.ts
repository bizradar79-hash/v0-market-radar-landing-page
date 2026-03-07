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
      `${ctx.company?.industry} חברות ישראל`,
      `מתחרים ${ctx.company?.name} ישראל`,
      `${ctx.company?.description?.slice(0, 80)} חברות ישראל`,
    ])
    steps.search = { ok: true, count: results.length }

    steps.ai = 'starting'
    const data = await analyzeWithAI(`זהה 10 מתחרים ישראליים אמיתיים מהמידע הבא בלבד:

${ctx.context}

תוצאות חיפוש:
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
    "pricing": "מחירון אם ידוע",
    "threat_score": 75
  }]
}`)
    const list = Array.isArray(data?.competitors) ? data.competitors : []
    steps.ai = { ok: true, count: list.length, keys: Object.keys(data || {}) }

    steps.db = 'starting'
    await ctx.supabase.from('competitors').delete().eq('company_id', ctx.user.id)
    const { data: saved, error: insertError } = await ctx.supabase.from('competitors').insert(
      list.map((c: any) => ({
        name: c.name,
        website: c.website,
        services: c.services,
        pricing: c.pricing,
        threat_score: c.threat_score,
        company_id: ctx.user.id,
      }))
    ).select()
    if (insertError) {
      steps.db = { ok: false, error: insertError.message, code: insertError.code }
      return NextResponse.json({ error: 'DB insert failed', steps }, { status: 500 })
    }
    steps.db = { ok: true, saved: saved?.length }

    return NextResponse.json({ success: true, competitors: saved, count: saved?.length || 0, steps })
  } catch (e: any) {
    console.error('find-competitors error:', e?.message)
    return NextResponse.json({ error: e?.message, stack: e?.stack?.split('\n').slice(0, 4), steps }, { status: 500 })
  }
}
