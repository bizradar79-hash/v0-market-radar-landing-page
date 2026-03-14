import { getFullContext } from '@/lib/context'
import { extractDomain } from '@/lib/dedup'
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

    const prompt = `בהתבסס על הסקירה הבאה של עסק ישראלי: ${businessOverview}
ואתר העסק: ${website}

תן לי רשימה של 10 מתחרים ישירים ועקיפים בישראל הרלוונטיים לסוג העסק הזה.
כלול רק חברות שאתה בטוח שקיימות ושיש להן אתר אינטרנט אמיתי.
החזר את כל הטקסט בעברית בלבד — שמות שירותים, תיאורים, הכל בעברית.

חשוב: אל תכלול חברה אם אינך יודע את כתובת האתר שלה. עדיף 5 חברות אמיתיות עם אתרים מאשר 10 חברות ללא אתרים.

החזר JSON בלבד במבנה הזה:
[{"name": "", "services": "", "website": "https://...", "threat_score": 0-100, "type": "ישיר/עקיף"}]

CRITICAL: Output ONLY a raw JSON array. No markdown, no code blocks, no explanation. Start with [ and end with ]`

    steps.ai = 'starting'

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    )
    const data = await response.json()
    steps.ai.gemini_status = response.status
    steps.ai.gemini_raw = data
    if (!response.ok || !data.candidates?.[0]) {
      return NextResponse.json({ error: 'Gemini API error', steps }, { status: 500 })
    }
    const text = data.candidates[0].content.parts[0].text
    steps.ai.raw_text = text

    // Strip markdown fences if present, then parse JSON
    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    const start = clean.indexOf('[')
    const end = clean.lastIndexOf(']')
    const list = start !== -1 && end > start ? JSON.parse(clean.slice(start, end + 1)) : []

    let competitors: any[] = Array.isArray(list) ? list : []

    steps.ai = {
      ok: true,
      raw: competitors.length,
      names: competitors.map((c: any) => `${c.name} → ${c.website || 'NO URL'}`),
    }

    // Keep only entries where Gemini provided a real URL
    competitors = competitors.filter((c: any) =>
      typeof c.website === 'string' && c.website.startsWith('http')
    )
    steps.ai.withUrl = competitors.length

    // Filter out own company
    competitors = competitors.filter((c: any) => {
      const domain = extractDomain(c.website || '')
      return domain !== ctx.companyDomain &&
        !c.name?.toLowerCase().includes(companyName.toLowerCase().slice(0, 6))
    })

    // Blocklist: known retailers, pharmacy chains, e-commerce
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
    const seenDomains = new Set<string>()
    competitors = competitors.filter((c: any) => {
      const domain = extractDomain(c.website)
      if (!domain || seenDomains.has(domain)) return false
      seenDomains.add(domain)
      return true
    })

    steps.db = 'starting'
    await ctx.supabase.from('competitors').delete().eq('company_id', ctx.user.id)

    if (competitors.length === 0) {
      return NextResponse.json({ success: true, competitors: [], count: 0, steps })
    }

    const { data: saved, error: insertError } = await ctx.supabase.from('competitors').insert(
      competitors.map((c: any) => ({
        name: c.name,
        website: c.website,
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
