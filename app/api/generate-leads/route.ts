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
      `${ctx.company?.industry} לקוחות קהל יעד ישראל`,
      `${ctx.company?.keywords?.[0]} ${ctx.company?.keywords?.[1]} חברות ישראל`,
      `מפיצים ${ctx.company?.industry} ישראל`,
    ])

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

    const filtered = data.leads.filter((l: any) =>
      l.name && l.website &&
      !l.name.includes(ctx.company?.name || '') &&
      l.website.startsWith('http')
    )

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
      console.error('Leads insert error:', insertError)
    }

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
    console.error('Generate leads error:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Failed', details: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
