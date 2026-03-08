import { getFullContext } from '@/lib/context'
import { analyzeWithAI, validateUrl } from '@/lib/ai'
import { multiSearch } from '@/lib/search'
import { deduplicateByDomain, extractDomain } from '@/lib/dedup'
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
    const { primaryKeywords, products, targetCustomers, industry } = ctx.companyProfile
    const results = await multiSearch([
      `לקוחות ${products} ישראל ${targetCustomers}`,
      `${primaryKeywords} קונים מפיצים ישראל`,
      `${industry} buyers distributors Israel`,
    ])
    steps.search = { ok: true, count: results.length }

    steps.ai = 'starting'
    const data = await analyzeWithAI(`מצא 8 לקוחות פוטנציאליים (קונים, מפיצים, שותפים) לחברה ${ctx.company?.name}.

${ctx.context}

תוצאות חיפוש:
${results.map(r => `[${r.title}] ${r.url} - ${r.content}`).join('\n')}

כללים קשיחים:
- לקוחות = עסקים שיקנו מ-${ctx.company?.name}, לא מתחרים!
- אסור לכלול את "${ctx.company?.name}" (דומיין: ${ctx.companyDomain})
- רק חברות עם websites אמיתיים ושונים
- CRITICAL: do not include company's own domain ${ctx.companyDomain}

{
  "leads": [{
    "name": "שם חברה אמיתי",
    "website": "URL אמיתי",
    "industry": "תעשייה",
    "location": "עיר",
    "reason": "למה יקנו",
    "score": 88,
    "source": "מקור"
  }]
}`)
    let list = Array.isArray(data?.leads) ? data.leads : []
    steps.ai = { ok: true, count: list.length }

    // Filter out own company
    list = list.filter((l: any) => {
      const domain = extractDomain(l.website || '')
      return domain !== ctx.companyDomain &&
        !l.name?.toLowerCase().includes((ctx.company?.name || '').toLowerCase().slice(0, 6)) &&
        (l.website || '').startsWith('http')
    })

    // Deduplicate by domain
    list = deduplicateByDomain(list, 'website')

    // Validate URLs concurrently
    steps.validate = 'starting'
    const withValid = await Promise.all(
      list.map(async (l: any) => ({ ...l, _valid: await validateUrl(l.website) }))
    )
    list = withValid.filter(l => l._valid).map(({ _valid, ...l }) => l)
    steps.validate = { ok: true, kept: list.length }

    steps.db = 'starting'
    await ctx.supabase.from('leads').delete().eq('company_id', ctx.user.id)
    const { data: saved, error: insertError } = await ctx.supabase.from('leads').insert(
      list.map((l: any) => ({
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
