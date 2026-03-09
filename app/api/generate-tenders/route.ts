import { getFullContext } from '@/lib/context'
import { analyzeWithAI, validateUrl } from '@/lib/ai'
import { multiSearch } from '@/lib/search'
import { deduplicateByField } from '@/lib/dedup'
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
    const results = await multiSearch([
      `מכרז ${primaryKeywords} ישראל 2026`,
      `מכרז ${products} ישראל 2025 2026`,
      `tender ${industry} Israel 2025 2026`,
    ])
    steps.search = { ok: true, count: results.length }

    // If no search results → return empty array, don't fabricate
    if (results.length === 0) {
      await ctx.supabase.from('tenders').delete().eq('company_id', ctx.user.id)
      steps.ai = { ok: true, count: 0, reason: 'no search results' }
      return NextResponse.json({ success: true, tenders: [], count: 0, steps })
    }

    const searchUrls = new Set(results.map(r => r.url))

    steps.ai = 'starting'
    const data = await analyzeWithAI(`מצא 5 מכרזים רלוונטיים מהמידע הבא:

${ctx.context}

תוצאות חיפוש מכרזים:
${results.map(r => `[${r.title}] ${r.url} - ${r.content}`).join('\n')}

כללים קשיחים:
- CRITICAL: Use ONLY data from the search results provided. Do NOT invent, hallucinate, or add any company, person, URL, or data that does not appear in the search results. If insufficient real data found, return empty array.
- ONLY use links that appear verbatim in the search results above
- אם אין מכרז אמיתי בתוצאות — החזר רשימה ריקה
- דדליין חייב להיות 2025 או 2026
- link חייב להיות URL שמופיע ברשימת תוצאות החיפוש

{
  "tenders": [{
    "title": "כותרת מכרז",
    "organization": "ארגון",
    "deadline": "2026-05-01",
    "budget": "₪500,000",
    "description": "תיאור",
    "link": "URL מהחיפוש בלבד",
    "relevance_score": 88
  }]
}`)
    let list = Array.isArray(data?.tenders) ? data.tenders : []
    steps.ai = { ok: true, count: list.length }

    // Keep only tenders whose link appears in search results
    list = list.filter((t: any) => t.link && searchUrls.has(t.link))

    // Deduplicate by link
    list = deduplicateByField(list, 'link')

    // Validate URLs concurrently
    steps.validate = 'starting'
    const withValid = await Promise.all(
      list.map(async (t: any) => ({ ...t, _valid: await validateUrl(t.link) }))
    )
    list = withValid.filter(t => t._valid).map(({ _valid, ...t }) => t)
    steps.validate = { ok: true, kept: list.length }

    steps.db = 'starting'
    await ctx.supabase.from('tenders').delete().eq('company_id', ctx.user.id)
    const { data: saved, error: insertError } = await ctx.supabase.from('tenders').insert(
      list.map((t: any) => ({
        title: t.title,
        organization: t.organization,
        deadline: /^\d{4}-\d{2}-\d{2}$/.test(t.deadline || '') ? t.deadline : null,
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
