import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'

export const maxDuration = 60

function isValidDate(d: string | null | undefined): boolean {
  return !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d))
}

export async function POST() {
  const steps: Record<string, any> = {}
  try {
    steps.context = 'starting'
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized', steps }, { status: 401 })
    steps.context = { ok: true, company: ctx.company?.name }

    const businessOverview = ctx.company?.business_overview || ctx.company?.description || ''

    const prompt = `בהתבסס על תחום העסק: ${businessOverview}
מצא 10 מכרזים ממשלתיים פתוחים בישראל הרלוונטיים לעסק זה.
כלול רק מכרזים עם תאריך הגשה עתידי.
לכל מכרז תן ציון רלוונטיות 0-100 לפי כמה הוא קשור לתחום העסק.
לכל מכרז חובה לכלול קישור ישיר לדף המכרז הספציפי (לא דף ראשי של אתר ולא דף חיפוש).
חפש בעברית ובאנגלית. החזר את כל הטקסט בעברית.
החזר JSON בלבד:
[{"title": "", "tender_number": "", "ministry": "", "deadline": "YYYY-MM-DD", "url": "", "description": "", "relevance_score": 0}]`

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

    // Filter: relevance_score >= 80
    list = list.filter((t: any) => (t.relevance_score ?? 0) >= 80)

    // Filter: deadline >= today or null
    const today = new Date().toISOString().split('T')[0]
    list = list.filter((t: any) => !t.deadline || t.deadline >= today)

    // Deduplicate by url
    const seenUrls = new Set<string>()
    list = list.filter((t: any) => {
      const url = (t.url || '').toLowerCase()
      if (!url || seenUrls.has(url)) return false
      seenUrls.add(url)
      return true
    })

    // Validate URLs: must return 200 with text/html Content-Type
    steps.validate = 'starting'
    const validated = await Promise.all(
      list.map(async (t: any) => {
        try {
          const res = await fetch(t.url, {
            method: 'HEAD',
            signal: AbortSignal.timeout(5000),
            headers: { 'User-Agent': 'Mozilla/5.0' },
          })
          const ct = res.headers.get('content-type') || ''
          return res.ok && ct.includes('text/html') ? t : null
        } catch {
          return null
        }
      })
    )
    list = validated.filter(Boolean)
    steps.validate = { ok: true, kept: list.length }

    steps.db = 'starting'
    await ctx.supabase.from('tenders').delete().eq('company_id', ctx.user.id)

    if (list.length < 3) {
      return NextResponse.json({ success: true, tenders: [], count: 0, message: 'לא נמצאו מכרזים רלוונטיים כרגע', steps })
    }

    const { data: saved, error: insertError } = await ctx.supabase.from('tenders').insert(
      list.map((t: any) => ({
        title: t.title || '',
        organization: t.ministry || '',
        deadline: isValidDate(t.deadline) ? t.deadline : null,
        budget: 'לא צוין',
        description: t.description || '',
        link: t.url || '',
        relevance_score: typeof t.relevance_score === 'number' ? Math.min(100, t.relevance_score) : 75,
        company_id: ctx.user.id,
      }))
    ).select()

    if (insertError) {
      steps.db = { ok: false, error: insertError.message, code: insertError.code }
      return NextResponse.json({ error: 'DB insert failed', steps }, { status: 500 })
    }
    steps.db = { ok: true, saved: saved?.length }

    return NextResponse.json({ success: true, tenders: saved, count: saved?.length || 0, steps })
  } catch (e: any) {
    console.error('generate-tenders error:', e?.message)
    return NextResponse.json({ error: e?.message, stack: e?.stack?.split('\n').slice(0, 4), steps }, { status: 500 })
  }
}
