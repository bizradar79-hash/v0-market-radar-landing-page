import { getFullContext } from '@/lib/context'
import { analyzeWithAI } from '@/lib/ai'
import { extractDomain } from '@/lib/dedup'
import { NextResponse } from 'next/server'

export const maxDuration = 60

// DDG Instant Answer API — extract best URL for a company name
async function findUrlWithDDG(name: string): Promise<string | null> {
  try {
    const query = encodeURIComponent(`${name} ישראל`)
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${query}&format=json&no_html=1&skip_disambig=1`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (!res.ok) return null
    const d = await res.json()

    // 1. Infobox website field (company's own site — most accurate)
    const box: any[] = d.Infobox?.content || []
    const infoWebsite = box.find((c: any) =>
      ['website', 'אתר', 'url'].some(l => c.label?.toLowerCase().includes(l))
    )?.value || ''
    if (infoWebsite?.startsWith('http')) return infoWebsite

    // 2. AbstractURL (usually Wikipedia — confirms existence)
    if (d.AbstractURL?.startsWith('http')) return d.AbstractURL

    // 3. First related topic URL
    const firstUrl = d.RelatedTopics?.[0]?.FirstURL
    if (firstUrl?.startsWith('http')) return firstUrl

    return null
  } catch {
    return null
  }
}

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
כלול רק חברות שאתה בטוח שקיימות בישראל.

החזר JSON בלבד במבנה הזה:
[{"name": "", "services": "", "threat_score": 0-100, "type": "ישיר/עקיף"}]

אל תכלול את החברה עצמה "${companyName}".
אסור לכלול: רשתות קמעונאיות, פארמקיות, חנויות, סופרמרקטים, מפיצים בלבד, iherb, amazon, eBay, Super-Pharm, סופר-פארם, שופרסל, רמי לוי.

CRITICAL: Output ONLY a raw JSON array. No markdown, no code blocks, no explanation. Start with [ and end with ]`
    )

    // Normalize — analyzeWithAI may return object or array
    let competitors: any[] = Array.isArray(list) ? list : (list as any)?.competitors || []

    steps.ai = {
      ok: true,
      raw: competitors.length,
      names: competitors.map((c: any) => c.name),
    }

    // Filter out own company
    competitors = competitors.filter((c: any) =>
      !c.name?.toLowerCase().includes(companyName.toLowerCase().slice(0, 6))
    )

    // Blocklist: known retailers, pharmacy chains, e-commerce
    const RETAIL_BLOCKLIST = [
      'שופרסל', 'רמי לוי', 'יינות ביתן', 'ויקטורי', 'סופר-פארם', 'super-pharm',
      'amazon', 'ebay', 'iherb', 'aliexpress', 'walgreens', 'boots',
    ]
    competitors = competitors.filter((c: any) => {
      const name = (c.name || '').toLowerCase()
      return !RETAIL_BLOCKLIST.some(b => name.includes(b.toLowerCase()))
    })

    // Deduplicate by name
    const seenNames = new Set<string>()
    competitors = competitors.filter((c: any) => {
      const key = (c.name || '').toLowerCase().trim()
      if (!key || seenNames.has(key)) return false
      seenNames.add(key)
      return true
    })

    // DDG URL lookup — parallel for all competitors
    steps.ddg = 'starting'
    const withUrls = await Promise.all(
      competitors.map(async (c: any) => {
        const url = await findUrlWithDDG(c.name)
        return { ...c, website: url || '' }
      })
    )

    const withRealUrls = withUrls.filter(c => c.website)
    const withoutUrls = withUrls.filter(c => !c.website)

    steps.ddg = {
      ok: true,
      withUrl: withRealUrls.length,
      withoutUrl: withoutUrls.length,
      found: withRealUrls.map(c => `${c.name} → ${c.website}`),
    }

    // >= 3 real URLs → use only those (deduped by domain)
    // < 3 → pad with unverified up to fill minimum of 3
    let final: any[]
    if (withRealUrls.length >= 3) {
      const seenDomains = new Set<string>()
      final = withRealUrls.filter((c: any) => {
        const domain = extractDomain(c.website)
        if (!domain || seenDomains.has(domain)) return false
        seenDomains.add(domain)
        return true
      })
    } else {
      const needed = Math.max(0, 3 - withRealUrls.length)
      final = [...withRealUrls, ...withoutUrls.slice(0, needed)]
    }

    steps.db = 'starting'
    await ctx.supabase.from('competitors').delete().eq('company_id', ctx.user.id)

    if (final.length === 0) {
      return NextResponse.json({ success: true, competitors: [], count: 0, steps })
    }

    const { data: saved, error: insertError } = await ctx.supabase.from('competitors').insert(
      final.map((c: any) => ({
        name: c.name,
        website: c.website || '',
        services: c.services || '',
        pricing: '',
        threat_score: typeof c.threat_score === 'number'
          ? (c.threat_score <= 10 ? c.threat_score * 10 : Math.min(100, c.threat_score))
          : 70,
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
