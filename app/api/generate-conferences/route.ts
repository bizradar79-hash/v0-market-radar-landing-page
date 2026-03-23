import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'
import type { BusinessProfile } from '@/types/business-profile'

export const maxDuration = 60

const CACHE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function isRecentYear(dateStr: string): boolean {
  const match = dateStr?.match(/20(2[5-9]|[3-9]\d)/)
  return !!match
}

export async function POST(request: Request) {
  const steps: Record<string, any> = {}
  try {
    steps.context = 'starting'
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized', steps }, { status: 401 })
    steps.context = { ok: true, company: ctx.company?.name }

    const force = new URL(request.url).searchParams.get('force') === 'true'
    if (!force) {
      const { data: latest } = await ctx.supabase
        .from('conferences').select('created_at').eq('company_id', ctx.user.id)
        .order('created_at', { ascending: false }).limit(1).single()
      if (latest?.created_at) {
        const age = Date.now() - new Date(latest.created_at).getTime()
        if (age < CACHE_MS) {
          console.log('[generate-conferences] cache hit, age:', Math.round(age / 3600000), 'h')
          return NextResponse.json({ success: true, cached: true })
        }
      }
    }

    const businessOverview = ctx.company?.business_overview || ctx.company?.description || ''
    const geoContext = ctx.geoContext || 'העסק פעיל בכל רחבי ישראל.'

    const businessProfile = (ctx.company?.business_profile ?? null) as BusinessProfile | null
    const industryTags = businessProfile?.industryTags?.length
      ? `תגיות תעשייה: ${businessProfile.industryTags.join(', ')}.`
      : ''
    const geoMarkets = businessProfile?.geographicMarkets?.length
      ? `שווקים גיאוגרפיים רלוונטיים: ${businessProfile.geographicMarkets.join(', ')}.`
      : ''

    const prompt = `בהתבסס על תחום העסק: ${businessOverview}
${industryTags}
${geoMarkets}
היקף גיאוגרפי: ${geoContext}
מצא 10 כנסים, תערוכות או אירועים מקצועיים רלוונטיים ב-2026.
${geoContext.includes('בינלאומי') ? 'כלול כנסים בינלאומיים גם מחוץ לישראל הרלוונטיים לתחום.' : 'כלול כנסים ואירועים בישראל בעיקר.'}
כלול רק אירועים אמיתיים עם תאריך עתידי.
כלול רק כנסים ואירועים עתידיים — תאריך 2026 בלבד שטרם עברו.
חפש בעברית ובאנגלית. החזר את כל הטקסט בעברית.
החזר JSON בלבד:
[{"name": "", "date": "YYYY-MM-DD", "location": "", "website": "", "description": "", "category": ""}]`

    steps.ai = { status: 'starting' }
    const response = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'grok-4-fast-non-reasoning',
        input: [{ role: 'user', content: prompt }],
        tools: [{ type: 'web_search' }],
      }),
    })
    const data = await response.json()
    if (!response.ok || !data.output) {
      steps.ai.error = data
      return NextResponse.json({ error: 'xAI API error', steps }, { status: 500 })
    }
    const text = data.output
      .filter((item: any) => item.type === 'message')
      .flatMap((item: any) => item.content)
      .filter((c: any) => c.type === 'output_text')
      .map((c: any) => c.text)
      .join('')

    // Strip markdown fences, parse JSON array
    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    const start = clean.indexOf('[')
    const end = clean.lastIndexOf(']')
    let list: any[] = start !== -1 && end > start ? JSON.parse(clean.slice(start, end + 1)) : []

    steps.ai = { ok: true, count: list.length }

    // Filter to 2025+ only
    list = list.filter((c: any) => c.date === null || isRecentYear(c.date || ''))

    // Filter out past events
    const today = new Date().toISOString().split('T')[0]
    list = list.filter((c: any) => !c.date || c.date >= today)

    // Deduplicate by website
    const seenUrls = new Set<string>()
    list = list.filter((c: any) => {
      const url = (c.website || '').toLowerCase()
      if (!url || seenUrls.has(url)) return false
      seenUrls.add(url)
      return true
    })

    steps.db = 'starting'
    await ctx.supabase.from('conferences').delete().eq('company_id', ctx.user.id)

    if (list.length === 0) {
      return NextResponse.json({ success: true, conferences: [], count: 0, steps })
    }

    const { data: saved, error: insertError } = await ctx.supabase.from('conferences').insert(
      list.map((c: any) => ({
        name: c.name,
        date: c.date || null,
        location: c.location || '',
        description: c.description || '',
        url: c.website || '',
        category: c.category || '',
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
