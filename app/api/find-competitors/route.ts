import { getFullContext } from '@/lib/context'
import { analyzeWithAI, validateUrl } from '@/lib/ai'
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

    const businessOverview = ctx.company?.business_overview || ctx.company?.description || ''
    const website = ctx.company?.website || ''
    const companyName = ctx.company?.name || ''

    steps.ai = 'starting'
    const list: any[] = await analyzeWithAI(
      `בהתבסס על הסקירה הבאה של עסק ישראלי: ${businessOverview}
ואתר העסק: ${website}

תן לי רשימה של 10 מתחרים ישירים ועקיפים בישראל הרלוונטיים לסוג העסק הזה.
אל תכלול את החברה עצמה "${companyName}".
כלול רק חברות ישראליות אמיתיות מאותו תחום בדיוק — אותו סוג ייצור, עיבוד, או אספקה.
אל תכלול רשתות קמעונאיות, חנויות, סופרמרקטים, או מפיצים בלבד.

CRITICAL: Output ONLY a raw JSON array. No markdown, no code blocks, no explanation. Start with [ and end with ]

[{"name": "", "website": "", "services": "", "threat_score": 0, "type": "ישיר/עקיף"}]`
    )

    steps.ai = { ok: true, raw: Array.isArray(list) ? list.length : typeof list }

    // Normalize — analyzeWithAI may return object or array
    let competitors: any[] = Array.isArray(list) ? list : (list as any)?.competitors || []

    // Filter out own company
    competitors = competitors.filter((c: any) => {
      const domain = extractDomain(c.website || '')
      return domain !== ctx.companyDomain &&
        !c.name?.toLowerCase().includes(companyName.toLowerCase().slice(0, 6))
    })

    // Blocklist: retailers, chains, supermarkets
    const RETAIL_BLOCKLIST = ['שופרסל', 'רמי לוי', 'יינות ביתן', 'ויקטורי', 'סופרמרקט',
      'רשת', 'חנות', 'amazon', 'ebay', 'iherb', 'aliexpress']
    competitors = competitors.filter((c: any) =>
      !RETAIL_BLOCKLIST.some(b => c.name?.includes(b) || c.website?.includes(b.toLowerCase()))
    )

    // Deduplicate by domain
    competitors = deduplicateByDomain(competitors, 'website')

    // Validate URLs to filter hallucinations
    steps.validate = 'starting'
    const withValid = await Promise.all(
      competitors.map(async (c: any) => ({ ...c, _valid: c.website ? await validateUrl(c.website) : false }))
    )
    competitors = withValid.filter(c => c._valid).map(({ _valid, ...c }) => c)
    steps.validate = { ok: true, kept: competitors.length }

    steps.db = 'starting'
    await ctx.supabase.from('competitors').delete().eq('company_id', ctx.user.id)

    if (competitors.length === 0) {
      return NextResponse.json({ success: true, competitors: [], count: 0, steps })
    }

    const { data: saved, error: insertError } = await ctx.supabase.from('competitors').insert(
      competitors.map((c: any) => ({
        name: c.name,
        website: c.website,
        services: c.services || c.type || '',
        pricing: '',
        threat_score: typeof c.threat_score === 'number' ? c.threat_score : 70,
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
