import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'

export const maxDuration = 60

const CACHE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0] // YYYY-MM-DD
}

function cutoffDate(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

async function fetchNews(businessOverview: string, days: number): Promise<any[]> {
  const cutoff = cutoffDate(days)
  const cutoffStr = toDateStr(cutoff)
  const todayStr = toDateStr(new Date())

  const prompt = `בהתבסס על תחום העסק: ${businessOverview}
מצא 10 חדשות רלוונטיות מ-${days} הימים האחרונים בלבד (מתאריך ${cutoffStr} עד היום ${todayStr}).
כלול חדשות מישראל ומהעולם.
דחה כל חדשה שפורסמה לפני ${cutoffStr}.

לכל חדשה תן relevance_score 0-100 ו-region: 'ישראל' או 'עולם'.
החזר JSON בלבד:
[{"title": "", "source": "", "date": "YYYY-MM-DD", "url": "", "summary": "", "relevance_score": 0, "region": "ישראל/עולם"}]

CRITICAL: Output ONLY a raw JSON array. No markdown. Start with [ and end with ]`

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

function filterNews(raw: any[], days: number): any[] {
  const cutoff = cutoffDate(days)
  return raw.filter((n: any) => {
    if ((n.relevance_score ?? 0) < 80) return false
    if (!n.date) return false
    const published = new Date(n.date)
    return !isNaN(published.getTime()) && published >= cutoff
  })
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
        .from('news').select('created_at').eq('company_id', ctx.user.id)
        .order('created_at', { ascending: false }).limit(1).single()
      if (latest?.created_at) {
        const age = Date.now() - new Date(latest.created_at).getTime()
        if (age < CACHE_MS) {
          console.log('[generate-news] cache hit, age:', Math.round(age / 3600000), 'h')
          return NextResponse.json({ success: true, cached: true })
        }
      }
    }

    const businessOverview = ctx.company?.business_overview || ctx.company?.description || ''

    // Step 1 — 30 days
    const raw30 = await fetchNews(businessOverview, 30)
    let list = filterNews(raw30, 30)
    steps.window30 = { raw: raw30.length, filtered: list.length }

    // Step 2 — expand to 60 days if fewer than 5 results
    if (list.length < 5) {
      const raw60 = await fetchNews(businessOverview, 60)
      const list60 = filterNews(raw60, 60)
      steps.window60 = { raw: raw60.length, filtered: list60.length }
      if (list60.length > list.length) list = list60
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
