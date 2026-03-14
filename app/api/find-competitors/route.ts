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
כלול רק יצרנים, מפעלים, או ספקים ישראליים מאותו תחום בדיוק.
אסור לכלול: רשתות קמעונאיות, פארמקיות, חנויות, סופרמרקטים, מפיצים בלבד, iherb, amazon, eBay, Super-Pharm, סופר-פארם, שופרסל, רמי לוי.
אם אינך בטוח באתר האינטרנט של חברה — השאר website ריק ("").

CRITICAL: Output ONLY a raw JSON array. No markdown, no code blocks, no explanation. Start with [ and end with ]

[{"name": "", "website": "", "services": "", "threat_score": 0, "type": "ישיר/עקיף"}]`
    )

    steps.ai = {
      ok: true,
      raw: Array.isArray(list) ? list.length : typeof list,
      names: Array.isArray(list) ? list.map((c: any) => c.name) : [],
    }

    // Normalize — analyzeWithAI may return object or array
    let competitors: any[] = Array.isArray(list) ? list : (list as any)?.competitors || []

    // Filter out own company
    competitors = competitors.filter((c: any) => {
      const domain = extractDomain(c.website || '')
      return domain !== ctx.companyDomain &&
        !c.name?.toLowerCase().includes(companyName.toLowerCase().slice(0, 6))
    })

    // Blocklist: known retailers, pharmacy chains, e-commerce — exact names only
    const RETAIL_BLOCKLIST = [
      'שופרסל', 'רמי לוי', 'יינות ביתן', 'ויקטורי', 'סופר-פארם', 'super-pharm',
      'amazon', 'ebay', 'iherb', 'aliexpress', 'walgreens', 'boots',
    ]
    competitors = competitors.filter((c: any) => {
      const name = (c.name || '').toLowerCase()
      const site = (c.website || '').toLowerCase()
      return !RETAIL_BLOCKLIST.some(b => name.includes(b.toLowerCase()) || site.includes(b.toLowerCase()))
    })

    // Deduplicate by domain
    competitors = deduplicateByDomain(competitors, 'website')

    // Validate URLs — blank website if invalid (don't discard the competitor entirely)
    steps.validate = 'starting'
    const withValid = await Promise.all(
      competitors.map(async (c: any) => ({
        ...c,
        website: c.website && await validateUrl(c.website) ? c.website : '',
      }))
    )
    competitors = withValid
    steps.validate = { ok: true, withWebsite: competitors.filter(c => c.website).length, total: competitors.length }

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
