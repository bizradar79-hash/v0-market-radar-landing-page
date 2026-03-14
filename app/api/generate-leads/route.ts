import { getFullContext } from '@/lib/context'
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

    const prompt = `בהתבסס על תחום העסק: ${businessOverview}
מצא 10 לידים פוטנציאליים בישראל — חברות או ארגונים שעשויים להיות לקוחות של עסק זה.
חפש בעברית ובאנגלית. החזר את כל הטקסט בעברית.
החזר JSON בלבד:
[{"name": "", "industry": "", "website": "", "reason": "", "contact_email": "", "relevance_score": 0}]`

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

    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    const start = clean.indexOf('[')
    const end = clean.lastIndexOf(']')
    let list: any[] = start !== -1 && end > start ? JSON.parse(clean.slice(start, end + 1)) : []

    steps.ai = { ok: true, count: list.length }

    // Filter out own company and entries without a website
    const companyName = (ctx.company?.name || '').toLowerCase().slice(0, 6)
    list = list.filter((l: any) =>
      l.website?.startsWith('http') &&
      !l.name?.toLowerCase().includes(companyName)
    )

    // Deduplicate by website
    const seenUrls = new Set<string>()
    list = list.filter((l: any) => {
      const url = (l.website || '').toLowerCase()
      if (!url || seenUrls.has(url)) return false
      seenUrls.add(url)
      return true
    })

    steps.db = 'starting'
    await ctx.supabase.from('leads').delete().eq('company_id', ctx.user.id)

    if (list.length === 0) {
      return NextResponse.json({ success: true, count: 0, steps })
    }

    const { data: saved, error: insertError } = await ctx.supabase.from('leads').insert(
      list.map((l: any) => ({
        name: l.name || '',
        website: l.website || '',
        industry: l.industry || '',
        location: '',
        reason: l.reason || '',
        score: typeof l.relevance_score === 'number' ? Math.min(100, l.relevance_score) : 70,
        source: '',
        company_id: ctx.user.id,
      }))
    ).select()

    if (insertError) {
      steps.db = { ok: false, error: insertError.message, code: insertError.code }
      return NextResponse.json({ error: 'DB insert failed', steps }, { status: 500 })
    }
    steps.db = { ok: true, saved: saved?.length }

    await ctx.supabase.from('alerts').insert({
      company_id: ctx.user.id,
      title: 'לידים חדשים התגלו',
      message: `${saved?.length || 0} לידים פוטנציאליים`,
      type: 'success',
      link: '/app/leads',
      is_read: false,
    })

    return NextResponse.json({ success: true, count: saved?.length || 0, steps })
  } catch (e: any) {
    console.error('generate-leads error:', e?.message)
    return NextResponse.json({ error: e?.message, stack: e?.stack?.split('\n').slice(0, 4), steps }, { status: 500 })
  }
}
