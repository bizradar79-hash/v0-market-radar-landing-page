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
      `${ctx.company?.industry} לקוחות קהל יעד ישראל`,
      `${ctx.company?.keywords?.[0]} ${ctx.company?.keywords?.[1]} חברות ישראל`,
      `מפיצים ${ctx.company?.industry} ישראל`,
    ])
    steps.search = { ok: true, count: results.length }

    steps.ai = 'starting'
    const data = await analyzeWithAI(`מצא 20 לקוחות פוטנציאליים אמיתיים לחברה ${ctx.company?.name}.

${ctx.context}

תוצאות חיפוש:
${results.map(r => `[${r.title}] ${r.url} - ${r.content}`).join('\n')}

כללים:
- לקוחות = עסקים שיקנו מ-${ctx.company?.name} (לא מתחרים!)
- רק חברות שמופיעות בתוצאות החיפוש
- רק URLs אמיתיים
- אל תכלול את ${ctx.company?.name} עצמה

{
  "leads": [{
    "name": "שם חברה אמיתי",
    "website": "URL אמיתי",
    "industry": "תעשייה",
    "location": "עיר בישראל",
    "reason": "למה יקנו",
    "score": 88,
    "source": "מקור"
  }]
}`)
    const list = Array.isArray(data?.leads) ? data.leads : []
    steps.ai = { ok: true, count: list.length, keys: Object.keys(data || {}) }

    const filtered = list.filter((l: any) =>
      l.name && l.website &&
      !l.name.includes(ctx.company?.name || '') &&
      l.website.startsWith('http')
    )

    steps.db = 'starting'
    await ctx.supabase.from('leads').delete().eq('company_id', ctx.user.id)
    const { data: saved, error: insertError } = await ctx.supabase.from('leads').insert(
      filtered.map((l: any) => ({
        name: l.name,
        website: l.website,
        industry: l.industry,
        location: l.location,
        reason: l.reason,
        score: l.score,
        source: l.source,
        company_id: ctx.user.id,
      }))
    ).select()
    if (insertError) {
      steps.db = { ok: false, error: insertError.message, code: insertError.code }
      return NextResponse.json({ error: 'DB insert failed', steps }, { status: 500 })
    }
    steps.db = { ok: true, saved: saved?.length }

    await ctx.supabase.from('alerts').insert({
      company_id: ctx.user.id,
      title: 'לידים חדשים התגלו',
      message: `${saved?.length || 0} לידים פוטנציאליים`,
      type: 'success',
      link: '/app/leads',
      is_read: false,
    })

    return NextResponse.json({ success: true, count: saved?.length || 0, steps })
  } catch (e: any) {
    console.error('generate-leads error:', e?.message)
    return NextResponse.json({ error: e?.message, stack: e?.stack?.split('\n').slice(0, 4), steps }, { status: 500 })
  }
}
