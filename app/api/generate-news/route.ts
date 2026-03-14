import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'

export const maxDuration = 60

const WINDOW_LABELS: Record<number, string> = {
  14: 'מהשבועיים האחרונים',
  28: 'מהחודש האחרון',
  42: 'מ-6 השבועות האחרונים',
  60: 'מחודשיים אחרונים',
}

async function fetchNews(businessOverview: string, days: number): Promise<any[]> {
  const windowLabel = WINDOW_LABELS[days] ?? `מ-${days} הימים האחרונים`
  const prompt = `בהתבסס על תחום העסק: ${businessOverview}
מצא 10 חדשות עסקיות רלוונטיות ${windowLabel} הקשורות לתחום זה בישראל ובעולם.
חפש בעברית ובאנגלית. החזר את כל הטקסט בעברית.
לכל חדשה הוסף שדה region: 'ישראל' אם המקור הוא ישראלי, 'עולם' אם המקור הוא בינלאומי.
החזר JSON בלבד:
[{"title": "", "source": "", "date": "YYYY-MM-DD", "url": "", "summary": "", "region": "ישראל"}]`

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
  if (!response.ok || !data.output) return []

  const text = data.output
    .filter((item: any) => item.type === 'message')
    .flatMap((item: any) => item.content)
    .filter((c: any) => c.type === 'output_text')
    .map((c: any) => c.text)
    .join('')

  const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
  const start = clean.indexOf('[')
  const end = clean.lastIndexOf(']')
  if (start === -1 || end <= start) return []

  try {
    const list = JSON.parse(clean.slice(start, end + 1))
    return Array.isArray(list) ? list : []
  } catch {
    return []
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

    // Expanding time window — stop when we have >= 10 results
    const windows = [14, 28, 42, 60]
    let list: any[] = []
    steps.windows = []

    for (const days of windows) {
      const results = await fetchNews(businessOverview, days)
      steps.windows.push({ days, count: results.length })
      if (results.length >= list.length) list = results
      if (list.length >= 10) break
    }

    steps.ai = { ok: true, count: list.length }

    // Deduplicate by url
    const seenUrls = new Set<string>()
    list = list.filter((n: any) => {
      const url = (n.url || '').toLowerCase()
      if (!url || seenUrls.has(url)) return false
      seenUrls.add(url)
      return true
    })

    steps.db = 'starting'
    await ctx.supabase.from('news').delete().eq('company_id', ctx.user.id)

    if (list.length === 0) {
      return NextResponse.json({ success: true, news: [], count: 0, steps })
    }

    const { data: saved, error: insertError } = await ctx.supabase.from('news').insert(
      list.map((n: any) => ({
        title: n.title || '',
        source: n.source || '',
        url: n.url || '',
        category: n.region === 'עולם' ? 'עולם' : 'ישראל',
        sentiment: 'neutral',
        summary: n.summary || '',
        company_id: ctx.user.id,
        published_at: n.date ? new Date(n.date).toISOString() : new Date().toISOString(),
      }))
    ).select()

    if (insertError) {
      steps.db = { ok: false, error: insertError.message, code: insertError.code }
      return NextResponse.json({ error: 'DB insert failed', steps }, { status: 500 })
    }
    steps.db = { ok: true, saved: saved?.length }

    return NextResponse.json({ success: true, news: saved, count: saved?.length || 0, steps })
  } catch (e: any) {
    console.error('generate-news error:', e?.message)
    return NextResponse.json({ error: e?.message, stack: e?.stack?.split('\n').slice(0, 4), steps }, { status: 500 })
  }
}
