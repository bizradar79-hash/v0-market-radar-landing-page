export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'

const CACHE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export async function POST(request: Request) {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const force = new URL(request.url).searchParams.get('force') === 'true'
    if (!force) {
      const { data: company } = await ctx.supabase
        .from('companies').select('review_analysis').eq('id', ctx.user.id).single()
      const cached = company?.review_analysis as { fetchedAt?: string } | null
      if (cached?.fetchedAt) {
        const age = Date.now() - new Date(cached.fetchedAt).getTime()
        if (age < CACHE_MS) return NextResponse.json({ success: true, ...cached, cached: true })
      }
    }

    const companyName = ctx.company?.name || ''
    const website = ctx.company?.website || ''
    const domain = website
      ? (() => { try { return new URL(website.startsWith('http') ? website : `https://${website}`).hostname.replace(/^www\./, '') } catch { return '' } })()
      : ''

    if (!companyName) return NextResponse.json({ error: 'Missing company name' }, { status: 400 })

    const prompt = `Use web_search to find the Google Maps listing for this exact business:
Business name: ${companyName}
Website: ${domain}

Search for: "${domain}" Google Maps

Return ONLY a JSON object with the Google Maps URL if found:
{ "google_maps_url": "https://maps.google.com/..." }

CRITICAL: Only return results where the URL or listing explicitly mentions "${domain}". If you cannot find a confirmed match, return { "google_maps_url": null }.`

    const response = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.XAI_API_KEY}` },
      body: JSON.stringify({
        model: 'grok-4-fast-non-reasoning',
        tools: [{ type: 'web_search' }],
        input: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await response.json()
    if (!response.ok || !data.output) {
      return NextResponse.json({ error: 'xAI API error', detail: data }, { status: 500 })
    }

    const text = data.output
      .filter((item: any) => item.type === 'message')
      .flatMap((item: any) => item.content)
      .filter((c: any) => c.type === 'output_text')
      .map((c: any) => c.text)
      .join('')

    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    const s = clean.indexOf('{')
    const e = clean.lastIndexOf('}')

    let google_maps_url: string | null = null
    if (s !== -1 && e > s) {
      try {
        const parsed = JSON.parse(clean.slice(s, e + 1))
        const url = parsed.google_maps_url || null
        // Only accept if URL is a real maps URL and contains the domain
        if (url && typeof url === 'string' && url.startsWith('http') && url.toLowerCase().includes('google')) {
          google_maps_url = url
        }
      } catch { /* leave null */ }
    }

    const result = {
      google_maps_url,
      fetchedAt: new Date().toISOString(),
    }

    await ctx.supabase.from('companies').update({ review_analysis: result }).eq('id', ctx.user.id)

    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
