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
      `${primaryKeywords} חדשות ישראל 2025 2026`,
      `${products} ${industry} מגמות ישראל`,
      `${industry} news Israel 2026`,
    ])
    steps.search = { ok: true, count: results.length }

    steps.ai = 'starting'
    const data = await analyzeWithAI(`בחר 15 חדשות רלוונטיות לתעשיית ${ctx.company?.industry} מהמידע הבא:

${ctx.context}

תוצאות חיפוש חדשות:
${results.map(r => `[${r.title}] ${r.url} - ${r.content}`).join('\n')}

כללים קשיחים:
- CRITICAL: Use ONLY data from the search results provided. Do NOT invent, hallucinate, or add any company, person, URL, or data that does not appear in the search results. If insufficient real data found, return empty array.
- חדשות על התעשייה והשוק, לא על ${ctx.company?.name} ספציפית
- רק URLs שמופיעים בתוצאות החיפוש — אסור להמציא URLs
- אסור לכתוב כתבות בדויות על ${ctx.company?.name}

{
  "news": [{
    "title": "כותרת מהחיפוש",
    "source": "שם אתר",
    "url": "URL מהחיפוש בלבד",
    "category": "קטגוריה",
    "sentiment": "positive",
    "summary": "תקציר קצר"
  }]
}`)
    let list = Array.isArray(data?.news) ? data.news : []
    steps.ai = { ok: true, count: list.length }

    // Deduplicate by url
    list = deduplicateByField(list, 'url')

    // Validate URLs concurrently
    steps.validate = 'starting'
    const withValid = await Promise.all(
      list.map(async (n: any) => ({ ...n, _valid: await validateUrl(n.url) }))
    )
    list = withValid.filter(n => n._valid).map(({ _valid, ...n }) => n)
    steps.validate = { ok: true, kept: list.length }

    steps.db = 'starting'
    await ctx.supabase.from('news').delete().eq('company_id', ctx.user.id)
    const { data: saved, error: insertError } = await ctx.supabase.from('news').insert(
      list.map((n: any) => ({
        title: n.title,
        source: n.source,
        url: n.url,
        category: n.category,
        sentiment: n.sentiment,
        summary: n.summary,
        company_id: ctx.user.id,
        published_at: new Date().toISOString(),
      }))
    ).select()
    if (insertError) {
      steps.db = { ok: false, error: insertError.message, code: insertError.code }
      return NextResponse.json({ error: 'DB insert failed', steps }, { status: 500 })
    }
    steps.db = { ok: true, saved: saved?.length }

    return NextResponse.json({ success: true, news: saved, count: saved?.length || 0, steps })
  } catch (e: any) {
    console.error('generate-news error:', e?.message)
    return NextResponse.json({ error: e?.message, stack: e?.stack?.split('\n').slice(0, 4), steps }, { status: 500 })
  }
}
