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
      `מכרזים ${ctx.company?.industry} ישראל 2026`,
      `מכרז ממשלתי ${ctx.company?.keywords?.[0]} 2026`,
      `tender ${ctx.company?.industry} Israel 2026`,
    ])
    steps.search = { ok: true, count: results.length }

    steps.ai = 'starting'
    const data = await analyzeWithAI(`מצא 8 מכרזים רלוונטיים מהמידע הבא:

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
    const list = Array.isArray(data?.tenders) ? data.tenders : []
    steps.ai = { ok: true, count: list.length, keys: Object.keys(data || {}) }

    steps.db = 'starting'
    await ctx.supabase.from('tenders').delete().eq('company_id', ctx.user.id)
    const { data: saved, error: insertError } = await ctx.supabase.from('tenders').insert(
      list.map((t: any) => ({
        title: t.title,
        organization: t.organization,
        deadline: t.deadline,
        budget: t.budget,
        description: t.description,
        link: t.link,
        relevance_score: t.relevance_score,
        company_id: ctx.user.id,
      }))
    ).select()
    if (insertError) {
      steps.db = { ok: false, error: insertError.message, code: insertError.code }
      return NextResponse.json({ error: 'DB insert failed', steps }, { status: 500 })
    }
    steps.db = { ok: true, saved: saved?.length }

    return NextResponse.json({ success: true, tenders: saved, count: saved?.length || 0, steps })
  } catch (e: any) {
    console.error('generate-tenders error:', e?.message)
    return NextResponse.json({ error: e?.message, stack: e?.stack?.split('\n').slice(0, 4), steps }, { status: 500 })
  }
}
