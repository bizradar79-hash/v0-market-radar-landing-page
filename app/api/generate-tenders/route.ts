import { getFullContext } from '@/lib/context'
import { deduplicateByField } from '@/lib/dedup'
import { trackSearchUsage } from '@/lib/usage'
import { NextResponse } from 'next/server'

export const maxDuration = 60

function isValidDate(d: string | null | undefined): boolean {
  return !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d))
}

// Convert DD/MM/YYYY or D.M.YYYY → YYYY-MM-DD
function parseHebrewDate(raw: string): string | null {
  const m = raw.match(/(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](20\d{2})/)
  if (!m) return null
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return isValidDate(iso) ? iso : null
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#160;/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim()
}

// Direct Serper call with full snippets (not using shared search() which limits to 80 chars)
async function searchSerperFull(query: string): Promise<Array<{
  title: string; url: string; snippet: string; date: string
}>> {
  if (!process.env.SERPER_API_KEY) return []
  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': process.env.SERPER_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, gl: 'il', hl: 'he', num: 10 }),
    })
    if (!res.ok) return []
    const data = await res.json()
    trackSearchUsage('serper').catch(() => {})
    return (data.organic || []).map((r: any) => ({
      title: decodeEntities(r.title || ''),
      url: r.link || '',
      snippet: decodeEntities(r.snippet || ''),
      date: r.date || '',
    }))
  } catch { return [] }
}

// Check content-type — skip PDFs and binaries
async function isHtmlUrl(url: string): Promise<boolean> {
  if (!url?.startsWith('http')) return false
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(3000),
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    const ct = res.headers.get('content-type') || ''
    return ct.includes('text/html') || ct.includes('text/plain')
  } catch { return false }
}

// Extract date from snippet — look for DD/MM/YYYY patterns
function extractDateFromText(text: string): string | null {
  // Patterns: "מועד אחרון: 12/05/2026", "הגשה עד 15.04.2026", etc.
  const matches = text.match(/(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]20\d{2})/g) || []
  for (const m of matches) {
    const d = parseHebrewDate(m)
    if (d) return d
  }
  return null
}

export async function POST() {
  const steps: Record<string, any> = {}
  try {
    steps.context = 'starting'
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized', steps }, { status: 401 })
    steps.context = { ok: true, company: ctx.company?.name }

    const { products, industry } = ctx.companyProfile
    const companyName = ctx.company?.name || ''
    const year = new Date().getFullYear()

    steps.search = 'starting'
    // Search specifically on mr.gov.il via Serper — Google has already rendered the JS
    const [r1, r2] = await Promise.all([
      searchSerperFull(`site:mr.gov.il מכרז ${industry} ${products} ${year}`),
      searchSerperFull(`site:mr.gov.il מכרז ${companyName} ${year}`),
    ])

    const seen = new Set<string>()
    const results = [...r1, ...r2]
      .filter(r => r.url?.includes('mr.gov.il') && !r.url.endsWith('.pdf'))
      .filter(r => { if (seen.has(r.url)) return false; seen.add(r.url); return true })
      .slice(0, 8)

    steps.search = { ok: true, count: results.length }

    if (results.length === 0) {
      await ctx.supabase.from('tenders').delete().eq('company_id', ctx.user.id)
      return NextResponse.json({ success: true, tenders: [], count: 0, steps })
    }

    // Check content-type — skip PDFs
    steps.validate = 'starting'
    const withType = await Promise.all(
      results.map(async (r) => ({ ...r, _html: await isHtmlUrl(r.url) }))
    )
    const htmlResults = withType.filter(r => r._html)
    steps.validate = { ok: true, htmlPages: htmlResults.length, skippedPdfs: results.length - htmlResults.length }

    // Build tender objects directly from Serper data — no scraping needed
    const today = new Date().toISOString().slice(0, 10)
    let list = htmlResults.map(r => {
      const deadline = extractDateFromText(r.snippet + ' ' + r.date)
      const status = deadline ? (deadline > today ? 'פתוח' : 'סגור') : 'לא ידוע'
      return {
        title: r.title.replace(/\s*[-|]\s*.*?(מרכז רכש|mr\.gov).*$/i, '').trim() || r.title,
        organization: 'מרכז רכש ממשלתי',
        deadline,
        budget: 'לא צוין',
        description: r.snippet.slice(0, 300),
        link: r.url,
        relevance_score: 75,
        status,
      }
    })

    list = deduplicateByField(list, 'link')
    steps.build = { ok: true, count: list.length }

    steps.db = 'starting'
    await ctx.supabase.from('tenders').delete().eq('company_id', ctx.user.id)

    if (list.length === 0) {
      return NextResponse.json({ success: true, tenders: [], count: 0, steps })
    }

    const { data: saved, error: insertError } = await ctx.supabase.from('tenders').insert(
      list.map((t: any) => ({
        title: t.title,
        organization: t.organization,
        deadline: isValidDate(t.deadline) ? t.deadline : null,
        budget: t.budget,
        description: t.description,
        link: t.link,
        relevance_score: t.relevance_score,
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
