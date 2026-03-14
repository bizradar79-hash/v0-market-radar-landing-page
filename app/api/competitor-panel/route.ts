import { getFullContext } from '@/lib/context'
import { analyzeWithAI } from '@/lib/ai'
import { trackSearchUsage } from '@/lib/usage'
import { NextResponse } from 'next/server'

export const maxDuration = 60

async function serperSearch(query: string, key: string) {
  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, gl: 'il', hl: 'he', num: 5 }),
    })
    if (!res.ok) return null
    trackSearchUsage('serper').catch(() => {})
    return await res.json()
  } catch { return null }
}

function extractMonthlyVisits(snippets: string): string | null {
  const patterns = [
    /(\d[\d,.]+\s*[KkMmBb])\s*(?:monthly\s*)?(?:unique\s*)?(?:visitors?|visits?)/i,
    /(\d[\d,.]+\s*[KkMmBb])\s*(?:ביקורים|מבקרים)/i,
    /(?:visitors?|visits?|ביקורים)\s*(?:per month|monthly|חודשי[ות]?)?\s*:?\s*(\d[\d,.]+\s*[KkMmBb])/i,
    /monthly\s*(?:visits?|visitors?|traffic)\s*[:\-]?\s*(\d[\d,.]+\s*[KkMmBb])/i,
  ]
  for (const p of patterns) {
    const m = snippets.match(p)
    if (m) return m[1].trim()
  }
  return null
}

export async function POST(req: Request) {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { competitorName, competitorWebsite } = await req.json()
    if (!competitorName) return NextResponse.json({ error: 'Missing competitorName' }, { status: 400 })

    const serperKey = process.env.SERPER_API_KEY
    const companyName = ctx.company?.name || ''
    const companyOverview = ctx.company?.business_overview || ctx.company?.description || ''

    // All 3 in parallel: contact info, traffic, AI summary
    const [infoData, trafficData, aiResult] = await Promise.all([
      serperKey ? serperSearch(competitorName, serperKey) : Promise.resolve(null),
      serperKey ? serperSearch(`${competitorName} website monthly traffic visitors statistics`, serperKey) : Promise.resolve(null),
      analyzeWithAI(`נתח את המתחרה הישראלי "${competitorName}" עבור החברה שלנו "${companyName}".
${companyOverview ? `\nהחברה שלנו: ${companyOverview.slice(0, 200)}` : ''}
${competitorWebsite ? `\nאתר המתחרה: ${competitorWebsite}` : ''}

כתוב 3-4 משפטים בעברית:
1. מה ${competitorName} עושה ומה הם מציעים
2. החוזקות שלהם מול העסק שלנו
3. רמת האיום ומה כדאי לנו לעשות

החזר JSON בלבד: {"summary": "3-4 משפטים כאן"}`),
    ])

    // Extract contact info from knowledge graph / local results
    const kg = infoData?.knowledgeGraph || {}
    const local: any = (infoData?.localResults || [])[0] || {}
    const contact = {
      address: local.address || kg.attributes?.['כתובת'] || kg.attributes?.['Address'] || '',
      phone: local.phone || kg.attributes?.['טלפון'] || kg.attributes?.['Phone'] || '',
      website: kg.website || local.website || competitorWebsite || '',
    }

    // Extract monthly visits from traffic search snippets
    const snippets = (trafficData?.organic || []).map((r: any) => `${r.title} ${r.snippet || ''}`).join(' ')
    const monthlyVisits = extractMonthlyVisits(snippets)

    return NextResponse.json({
      contact,
      aiSummary: aiResult?.summary || '',
      monthlyVisits,
    })
  } catch (e: any) {
    console.error('competitor-panel error:', e?.message)
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
