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
מצא 10 טרנדים מובילים מהשבועיים האחרונים הרלוונטיים לתחום זה.

חפש במקורות הבאים:
1. גוגל טרנד — מילות חיפוש טרנדיות בתחום
2. רשתות חברתיות — האשטאגים ונושאים ויראליים
3. מנועי AI ופורומים מקצועיים — נושאים חמים

לכל טרנד ציין:
- מקור: גוגל טרנד / רשתות חברתיות / AI ופורומים
- עוצמת הטרנד: עולה / יציב / יורד

חפש בעברית ובאנגלית. החזר את כל הטקסט בעברית.
החזר JSON בלבד:
[{"title": "", "description": "", "source": "", "momentum": "עולה/יציב/יורד", "keywords": [], "url": ""}]`

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

    // Deduplicate by title
    const seenTitles = new Set<string>()
    list = list.filter((t: any) => {
      const key = (t.title || '').toLowerCase()
      if (!key || seenTitles.has(key)) return false
      seenTitles.add(key)
      return true
    })

    steps.db = 'starting'
    await ctx.supabase.from('trends').delete().eq('company_id', ctx.user.id)

    if (list.length === 0) {
      return NextResponse.json({ success: true, trends: [], count: 0, steps })
    }

    const { data: saved, error: insertError } = await ctx.supabase.from('trends').insert(
      list.map((t: any) => ({
        name: t.title || '',
        description: t.description || '',
        score: 75,
        direction: t.momentum || 'יציב',
        category: t.source || '',
        company_id: ctx.user.id,
      }))
    ).select()

    if (insertError) {
      steps.db = { ok: false, error: insertError.message, code: insertError.code }
      return NextResponse.json({ error: 'DB insert failed', steps }, { status: 500 })
    }
    steps.db = { ok: true, saved: saved?.length }

    return NextResponse.json({ success: true, trends: saved, count: saved?.length || 0, steps })
  } catch (e: any) {
    console.error('generate-trends error:', e?.message)
    return NextResponse.json({ error: e?.message, stack: e?.stack?.split('\n').slice(0, 4), steps }, { status: 500 })
  }
}
