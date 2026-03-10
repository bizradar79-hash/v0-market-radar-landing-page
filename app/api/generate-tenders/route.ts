import { getFullContext } from '@/lib/context'
import { analyzeWithAI, validateUrl } from '@/lib/ai'
import { multiSearch } from '@/lib/search'
import { deduplicateByField } from '@/lib/dedup'
import { NextResponse } from 'next/server'

export const maxDuration = 60

const TENDER_SITES = ['mr.gov.il', 'tenders.gov.il', 'procurement.gov.il']

function isValidDate(d: string | null | undefined): boolean {
  return !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d))
}

function isTenderSiteUrl(url: string): boolean {
  if (!url) return false
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    return TENDER_SITES.some(s => host === s || host.endsWith('.' + s))
  } catch { return false }
}

export async function POST() {
  const steps: Record<string, any> = {}
  try {
    steps.context = 'starting'
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized', steps }, { status: 401 })
    steps.context = { ok: true, company: ctx.company?.name }

    steps.search = 'starting'
    const { primaryKeywords, products, industry } = ctx.companyProfile
    const companyName = ctx.company?.name || ''
    const results = await multiSearch([
      `מכרז ${products} ${industry} ישראל 2025 2026`,
      `מכרז ${companyName} OR "${primaryKeywords}" mr.gov.il`,
      `הזמנה להציע הצעות ${products} ישראל 2026`,
      `מכרז ${industry} ${products} tenders.gov.il OR mr.gov.il`,
    ])
    steps.search = { ok: true, count: results.length }

    if (results.length === 0) {
      await ctx.supabase.from('tenders').delete().eq('company_id', ctx.user.id)
      steps.ai = { ok: true, count: 0, reason: 'no search results' }
      return NextResponse.json({ success: true, tenders: [], count: 0, steps })
    }

    const searchUrls = new Set(results.map(r => r.url))

    steps.ai = 'starting'
    const today = new Date().toISOString().slice(0, 10)
    const data = await analyzeWithAI(`מצא עד 5 מכרזים ממשלתיים ישראליים רלוונטיים מהתוצאות הבאות:

${ctx.context}

תוצאות חיפוש:
${results.map(r => `[${r.title}] ${r.url} - ${r.content}`).join('\n')}

כללים קשיחים:
- CRITICAL: Use ONLY data from the search results provided. Do NOT invent, hallucinate, or add any company, person, URL, or data that does not appear in the search results. If insufficient real data found, return empty array.
- כלול רק מכרזים עם URL אמיתי מהתוצאות — mr.gov.il, tenders.gov.il, procurement.gov.il, עיריות ישראליות
- כותרת חייבת לכלול את המילה מכרז, הזמנה להציע, או בקשה להצעות
- אסור לכלול מודעות דרושים, כתבות חדשות, או עמודי מוצר
- deadline חייב להיות בפורמט YYYY-MM-DD בלבד, אחרת null
- status: אם deadline > ${today} = "פתוח", אם deadline < ${today} = "סגור", אם null = "לא ידוע"

{
  "tenders": [{
    "title": "שם המכרז המלא",
    "organization": "הגוף המפרסם",
    "deadline": "2026-06-01",
    "budget": "₪500,000",
    "description": "תיאור קצר",
    "link": "URL מהחיפוש בלבד",
    "relevance_score": 85,
    "status": "פתוח"
  }]
}`)

    let list = Array.isArray(data?.tenders) ? data.tenders : []
    steps.ai = { ok: true, count: list.length }

    // Keep only tenders whose link appears in search results
    list = list.filter((t: any) => t.link && searchUrls.has(t.link))

    // Extra: reject links that don't look like tender sites (best-effort)
    // We still allow through if URL validation passes — isTenderSiteUrl is advisory
    const tenderSiteOnly = list.filter((t: any) => isTenderSiteUrl(t.link))
    if (tenderSiteOnly.length > 0) list = tenderSiteOnly

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
        deadline: isValidDate(t.deadline) ? t.deadline : null,
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
