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
      `${ctx.company?.industry} חברות ישראל`,
      `מתחרים ${ctx.company?.name} ישראל`,
      `${ctx.company?.description?.slice(0, 80)} חברות ישראל`,
    ])

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

    await ctx.supabase.from('competitors').delete().eq('company_id', ctx.user.id)
    const { data: saved, error: insertError } = await ctx.supabase.from('competitors').insert(
      data.competitors.map((c: any) => ({
        name: c.name,
        website: c.website,
        services: c.services,
        pricing: c.pricing,
        threat_score: c.threat_score,
        company_id: ctx.user.id,
      }))
    ).select()

    if (insertError) {
      console.error('Competitors insert error:', insertError)
    }

    return NextResponse.json({ success: true, competitors: saved, count: saved?.length || 0 })
  } catch (error) {
    console.error('Find competitors error:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Failed', details: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
