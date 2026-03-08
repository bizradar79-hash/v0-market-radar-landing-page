import { getFullContext } from '@/lib/context'
import { analyzeWithAI, validateUrl } from '@/lib/ai'
import { multiSearch } from '@/lib/search'
import { deduplicateByField } from '@/lib/dedup'
import { NextResponse } from 'next/server'

export const maxDuration = 60

function isRecentYear(dateStr: string): boolean {
  const match = dateStr?.match(/20(2[5-9]|[3-9]\d)/)
  return !!match
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
    const results = await multiSearch([
      `כנס ${primaryKeywords} ישראל 2026`,
      `conference ${industry} ${products} Israel 2025 2026`,
      `ועידה ${industry} ישראל 2026 אירוע`,
    ])
    steps.search = { ok: true, count: results.length }

    steps.ai = 'starting'
    const data = await analyzeWithAI(`מצא 8 כנסים ואירועים מקצועיים מהמידע הבא:

${ctx.context}

תוצאות חיפוש:
${results.map(r => `[${r.title}] ${r.url} - ${r.content}`).join('\n')}

כללים קשיחים:
- רק כנסים בשנים 2025 או 2026 בלבד — אסור לכלול אירועים ישנים יותר
- רק URLs אמיתיים מתוצאות החיפוש
- תאריך חייב לכלול 2025 או 2026
- חלץ את התאריך האמיתי מתוצאות החיפוש — אם לא ידוע, השתמש null
- אסור לכתוב 2026-01-01 כתאריך ברירת מחדל
- אסור להשתמש בתו " (גרשיים) בתוך ערכי טקסט — כתוב ע"ש כ-עש או פשוט ללא גרשיים

{
  "conferences": [{
    "name": "שם כנס אמיתי",
    "date": "2026-03-15",
    "location": "מיקום",
    "description": "תיאור",
    "url": "URL אמיתי מהחיפוש",
    "category": "קטגוריה"
  }]
}`)
    let list = Array.isArray(data?.conferences) ? data.conferences : []
    steps.ai = { ok: true, count: list.length }

    // Filter to 2025+ only (allow null dates through)
    list = list.filter((c: any) => c.date === null || isRecentYear(c.date || ''))

    // Deduplicate by url
    list = deduplicateByField(list, 'url')

    // Validate URLs concurrently
    steps.validate = 'starting'
    const withValid = await Promise.all(
      list.map(async (c: any) => ({ ...c, _valid: await validateUrl(c.url) }))
    )
    list = withValid.filter(c => c._valid).map(({ _valid, ...c }) => c)
    steps.validate = { ok: true, kept: list.length }

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
