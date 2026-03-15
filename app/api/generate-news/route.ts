import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'

export const maxDuration = 60

const WINDOWS = [
  { days: 14,  label: 'מהשבועיים האחרונים' },
  { days: 30,  label: 'מהחודש האחרון' },
  { days: 60,  label: 'מחודשיים אחרונים' },
  { days: 120, label: 'מ-4 חודשים אחרונים' },
]

async function fetchNews(businessOverview: string, days: number, label: string): Promise<any[]> {
  const prompt = `בהתבסס על תחום העסק: ${businessOverview}
מצא 10 חדשות עסקיות רלוונטיות ${label} הקשורות לתחום זה בישראל ובעולם.
לכל חדשה תן ציון רלוונטיות 0-100 לפי כמה היא קשורה לתחום העסק הספציפי.
לכל חדשה הוסף שדה region: 'ישראל' אם המקור הוא ישראלי, 'עולם' אם המקור הוא בינלאומי.
חפש בעברית ובאנגלית. החזר את כל הטקסט בעברית.
החזר JSON בלבד:
[{"title": "", "source": "", "date": "YYYY-MM-DD", "url": "", "summary": "", "region": "ישראל", "relevance_score": 0}]`

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

    // Expanding time window — stop when filtered results >= 5
    let list: any[] = []
    steps.windows = []

    for (const window of WINDOWS) {
      const results = await fetchNews(businessOverview, window.days, window.label)
      const filtered = results.filter((n: any) => (n.relevance_score ?? 0) >= 80)
      steps.windows.push({ days: window.days, raw: results.length, filtered: filtered.length })
      if (filtered.length >= 5) { list = filtered; break }
      // keep best result so far
      if (filtered.length > list.length) list = filtered
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
