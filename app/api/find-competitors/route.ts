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
    const { primaryKeywords, products, industry } = ctx.companyProfile
    // Use business_overview for richer, niche-specific queries
    const overview = ctx.company?.business_overview || ''
    const overviewTerms = overview ? overview.split(/[.!?]/)[0].slice(0, 100).trim() : ''
    const searches: string[] = [
      `${primaryKeywords} מתחרים ישראל`,
      `${products} חברות ישראל ${industry}`,
      `${primaryKeywords} competitors Israel`,
    ]
    if (overviewTerms) {
      // Add production-level search to find manufacturers/suppliers, not just resellers
      searches.push(`"יצרן" OR "מפעל" OR "ספק" ${industry} ישראל`)
      searches.push(`${overviewTerms} מתחרים ישראל`)
    }
    const results = await multiSearch(searches)
    steps.search = { ok: true, count: results.length }

    const searchUrls = new Set(results.map(r => r.url))

    steps.ai = 'starting'
    const data = await analyzeWithAI(`זהה 12 מתחרים ישראליים אמיתיים לחברה ${ctx.company?.name}.

${ctx.context}

תוצאות חיפוש:
${results.map(r => `[${r.title}] ${r.url} - ${r.content}`).join('\n')}

כללים קשיחים:
- CRITICAL: Use ONLY data from the search results provided. Do NOT invent, hallucinate, or add any company, person, URL, or data that does not appear in the search results. If insufficient real data found, return empty array.
- אסור לכלול את "${ctx.company?.name}" (דומיין: ${ctx.companyDomain}) בתוצאות
- רק חברות שמופיעות בתוצאות החיפוש עם URLs אמיתיים
- רק מתחרים ישירים (אותה תעשייה, אותם מוצרים/שירותים)
- לפחות 8 מתחרים ייחודיים
- name חייב להיות שם חברה אמיתי — לא קטגוריה, תיאור, או סוג תעשייה

{
  "competitors": [{
    "name": "שם חברה אמיתי",
    "website": "URL אמיתי מהחיפוש",
    "services": "שירותים",
    "pricing": "מחירון אם ידוע",
    "threat_score": 75
  }]
}`)
    let list = Array.isArray(data?.competitors) ? data.competitors : []
    steps.ai = { ok: true, count: list.length }

    // Filter out own company
    list = list.filter((c: any) => {
      const domain = extractDomain(c.website || '')
      return domain !== ctx.companyDomain &&
        !c.name?.toLowerCase().includes((ctx.company?.name || '').toLowerCase().slice(0, 6))
    })

    // Deduplicate by domain
    list = deduplicateByDomain(list, 'website')

    // Validate URLs concurrently
    steps.validate = 'starting'
    const withValid = await Promise.all(
      list.map(async (c: any) => ({ ...c, _valid: await validateUrl(c.website) }))
    )
    list = withValid.filter(c => c._valid).map(({ _valid, ...c }) => c)
    steps.validate = { ok: true, kept: list.length }

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
