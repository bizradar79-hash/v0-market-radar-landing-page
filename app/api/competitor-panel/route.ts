import { getFullContext } from '@/lib/context'
import { analyzeWithAI } from '@/lib/ai'
import { trackSearchUsage } from '@/lib/usage'
import { NextResponse } from 'next/server'

export const maxDuration = 60

function extractMonthlyVisits(text: string): string | null {
  const patterns = [
    /(\d[\d,.]+\s*[KkMmBb])\s*(?:monthly\s*)?(?:unique\s*)?(?:visitors?|visits?)/i,
    /(\d[\d,.]+\s*[KkMmBb])\s*(?:ביקורים|מבקרים)/i,
    /(?:visitors?|visits?|ביקורים)\s*(?:per month|monthly|חודשי[ות]?)?\s*:?\s*(\d[\d,.]+\s*[KkMmBb])/i,
    /monthly\s*(?:visits?|visitors?|traffic)\s*[:\-]?\s*(\d[\d,.]+\s*[KkMmBb])/i,
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (m) return (m[1] || m[2]).trim()
  }
  return null
}

interface ContactInfo { address: string; phone: string; website: string }

// Fetch contact info: DDG Infobox → Brave → Serper KG
async function fetchContactInfo(name: string): Promise<ContactInfo> {
  const empty: ContactInfo = { address: '', phone: '', website: '' }

  // 1. DuckDuckGo Infobox
  try {
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(name)}&format=json&no_html=1&skip_disambig=1`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (res.ok) {
      const d = await res.json()
      const box: any[] = d.Infobox?.content || []
      const get = (...labels: string[]) =>
        box.find((c: any) => labels.some(l => c.label?.toLowerCase().includes(l)))?.value || ''
      const address = get('address', 'כתובת', 'headquarters', 'location')
      const phone = get('phone', 'טלפון', 'telephone')
      const website = get('website', 'אתר', 'url') || d.AbstractURL || ''
      if (address || phone || website) return { address, phone, website }
    }
  } catch {}

  // 2. Brave — use first organic result's URL as website
  if (process.env.BRAVE_API_KEY) {
    try {
      const res = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(name)}&count=5`,
        {
          headers: { 'X-Subscription-Token': process.env.BRAVE_API_KEY, 'Accept': 'application/json' },
          signal: AbortSignal.timeout(5000),
        }
      )
      if (res.ok) {
        const d = await res.json()
        const website = (d.web?.results || [])[0]?.url || ''
        if (website) return { address: '', phone: '', website }
      }
    } catch {}
  }

  // 3. Serper KG
  if (!process.env.SERPER_API_KEY) return empty
  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: name, gl: 'il', hl: 'he', num: 5 }),
    })
    if (!res.ok) return empty
    const d = await res.json()
    const kg = d.knowledgeGraph || {}
    const local: any = (d.localResults || [])[0] || {}
    trackSearchUsage('serper').catch(() => {})
    return {
      address: local.address || kg.attributes?.['כתובת'] || kg.attributes?.['Address'] || '',
      phone: local.phone || kg.attributes?.['טלפון'] || kg.attributes?.['Phone'] || '',
      website: kg.website || local.website || '',
    }
  } catch { return empty }
}

// Fetch snippets for traffic analysis: DDG → Brave → Serper
async function fetchTrafficSnippets(name: string): Promise<string> {
  const q = `${name} website monthly traffic visitors statistics`

  // 1. DuckDuckGo
  try {
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (res.ok) {
      const d = await res.json()
      const snippets = [d.AbstractText, ...(d.RelatedTopics || []).map((t: any) => t.Text || '')].filter(Boolean).join(' ')
      if (snippets.length > 50) return snippets
    }
  } catch {}

  // 2. Brave
  if (process.env.BRAVE_API_KEY) {
    try {
      const res = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=5`,
        {
          headers: { 'X-Subscription-Token': process.env.BRAVE_API_KEY, 'Accept': 'application/json' },
          signal: AbortSignal.timeout(5000),
        }
      )
      if (res.ok) {
        const d = await res.json()
        const snippets = (d.web?.results || []).map((r: any) => `${r.title} ${r.description || ''}`).join(' ')
        if (snippets.length > 50) return snippets
      }
    } catch {}
  }

  // 3. Serper
  if (!process.env.SERPER_API_KEY) return ''
  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, gl: 'il', hl: 'he', num: 5 }),
    })
    if (!res.ok) return ''
    const d = await res.json()
    trackSearchUsage('serper').catch(() => {})
    return (d.organic || []).map((r: any) => `${r.title} ${r.snippet || ''}`).join(' ')
  } catch { return '' }
}

export async function POST(req: Request) {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { competitorName, competitorWebsite } = await req.json()
    if (!competitorName) return NextResponse.json({ error: 'Missing competitorName' }, { status: 400 })

    const companyName = ctx.company?.name || ''
    const companyOverview = ctx.company?.business_overview || ctx.company?.description || ''

    // All 3 in parallel: contact info, traffic snippets, AI summary
    const [contact, trafficText, aiResult] = await Promise.all([
      fetchContactInfo(competitorName),
      fetchTrafficSnippets(competitorName),
      analyzeWithAI(`נתח את המתחרה הישראלי "${competitorName}" עבור החברה שלנו "${companyName}".
${companyOverview ? `\nהחברה שלנו: ${companyOverview.slice(0, 200)}` : ''}
${competitorWebsite ? `\nאתר המתחרה: ${competitorWebsite}` : ''}

כתוב 3-4 משפטים בעברית:
1. מה ${competitorName} עושה ומה הם מציעים
2. החוזקות שלהם מול העסק שלנו
3. רמת האיום ומה כדאי לנו לעשות

החזר JSON בלבד: {"summary": "3-4 משפטים כאן"}`),
    ])

    return NextResponse.json({
      contact: {
        ...contact,
        website: contact.website || competitorWebsite || '',
      },
      aiSummary: aiResult?.summary || '',
      monthlyVisits: extractMonthlyVisits(trafficText),
    })
  } catch (e: any) {
    console.error('competitor-panel error:', e?.message)
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
