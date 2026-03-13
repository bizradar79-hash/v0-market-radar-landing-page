import { analyzeWithAI } from '@/lib/ai'
import { getFullContext } from '@/lib/context'
import { deduplicateByField } from '@/lib/dedup'
import { trackSearchUsage } from '@/lib/usage'
import { NextResponse } from 'next/server'

export const maxDuration = 60
const ROUTE_VERSION = 'v14-no-jobs'

function isValidDate(d: string | null | undefined): boolean {
  return !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d))
}

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

function extractDateFromText(text: string): string | null {
  const matches = text.match(/(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]20\d{2})/g) || []
  for (const m of matches) {
    const d = parseHebrewDate(m)
    if (d) return d
  }
  return null
}

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

interface Enriched {
  tender_number: string | null
  deadline: string | null
  ministry: string | null
  is_specific: boolean
}

async function enrichWithGroq(
  results: Array<{ title: string; url: string; snippet: string; date: string }>
): Promise<Enriched[]> {
  const fallback: Enriched[] = results.map(() => ({
    tender_number: null, deadline: null, ministry: null, is_specific: true,
  }))
  if (results.length === 0) return fallback

  const items = results.map((r, i) =>
    `[${i + 1}] Title: ${r.title}\nURL: ${r.url}\nSnippet: ${r.snippet}${r.date ? `\nDate: ${r.date}` : ''}`
  ).join('\n\n')

  const system = `You analyze Israeli government tender search results.
For each result extract:
- tender_number: tender number like "02/2026" or "24/2025", null if not found
- deadline: submission deadline in YYYY-MM-DD. Look aggressively for date patterns near words like "מועד אחרון", "הגשה עד", "תאריך סיום", "פתוח עד", "סגירה". Convert DD/MM/YYYY or D.M.YYYY to YYYY-MM-DD. If no date found, return null.
- ministry: publishing organization name in Hebrew, null if not found
- is_specific: true if this is a specific individual tender announcement, false if it is a listing/index page, HR job posting, or unrelated page

Return ONLY a JSON array, no markdown, no explanation.`

  const user = `CRITICAL: Output ONLY JSON array. No markdown code blocks.

Analyze these ${results.length} search results:

${items}

Return array of ${results.length} objects: [{"tender_number":...,"deadline":...,"ministry":...,"is_specific":...}, ...]`

  try {
    const prompt = `${system}\n\n${user}`
    const parsed: any[] = await analyzeWithAI(prompt)
    if (!Array.isArray(parsed)) return fallback
    return results.map((_, i) => {
      const item = parsed[i] || {}
      return {
        tender_number: item.tender_number || null,
        deadline: isValidDate(item.deadline) ? item.deadline : parseHebrewDate(String(item.deadline || '')),
        ministry: item.ministry || null,
        is_specific: item.is_specific !== false,
      }
    })
  } catch {
    return fallback
  }
}

export async function POST() {
  const steps: Record<string, any> = {}
  try {
    steps.context = 'starting'
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized', steps }, { status: 401 })
    steps.context = { ok: true, company: ctx.company?.name }

    const { products, industry } = ctx.companyProfile
    const year = new Date().getFullYear()

    // Step 1: Serper — find specific tender pages
    steps.search = 'starting'
    const q1 = `"הזמנה להציע" OR "מכרז פומבי" ${products} ${year} gov.il -"למשרת" -"לתפקיד" -"דרושים"`
    const q2 = `"הזמנה להציע" OR "מכרז פומבי" ${industry} ${year} gov.il -"למשרת" -"לתפקיד" -"דרושים"`
    const [r1, r2] = await Promise.all([
      searchSerperFull(q1),
      searchSerperFull(q2),
    ])

    // Titles that must never appear
    const BAD_TITLE = [
      '[XLS]', '[PDF]', '[DOC]', '.xls', '.xlsx',
      'רשימת מכרזים', 'מכרזים והתקשרויות', 'govextra',
      'Freedom of Information', 'אתר הכנסת',
      'תוצאות חיפוש', 'נמצאו', 'ILG Site', 'search results', 'חיפוש מתקדם', 'Untitled',
      // Job postings — not procurement tenders
      'למשרת', 'לתפקיד', 'דרושים', ' משרה ', ' תפקיד ',
    ]
    // Title must contain at least one of these to be a real tender
    const GOOD_TITLE_RE = /מכרז פומבי|מכרז מס'|מכרז מספר|הזמנה להציע|\d{2,6}[\/\-]\d{2,4}/

    const isBadTitle = (t: string) => BAD_TITLE.some(b => t.includes(b)) || /^מכרזי /.test(t)
    const isGoodTitle = (t: string) => GOOD_TITLE_RE.test(t)

    // URL patterns that indicate listing/index pages
    const LISTING_URL = [/\/tenders\.aspx/i, /\/pages\/tenders/i, /\/tenders\/?$/, /\/bids\/?$/, /\/procurement\/?$/, /procurementManager/]
    const JUNK_DOMAINS = ['indeed.com', 'rssing.com', 'anyflip.com', 'fliphtml5.com', 'svn.apache.org', 'ejobs.gov.il']

    const seen = new Set<string>()
    const candidates = [...r1, ...r2]
      .filter(r => r.url?.includes('.gov.il'))
      .filter(r => !r.url.match(/\.(pdf|doc|docx|xls|xlsx)$/i))
      .filter(r => !isBadTitle(r.title))
      .filter(r => isGoodTitle(r.title))
      .filter(r => !JUNK_DOMAINS.some(d => r.url.includes(d)))
      .filter(r => !LISTING_URL.some(p => p.test(r.url)))
      .filter(r => { if (seen.has(r.url)) return false; seen.add(r.url); return true })
      .slice(0, 10)

    steps.search = {
      ok: true,
      count: candidates.length,
      queries: [q1, q2],
      rawTitles: [...r1, ...r2].slice(0, 10).map(r => ({ title: r.title, url: r.url })),
    }

    if (candidates.length === 0) {
      await ctx.supabase.from('tenders').delete().eq('company_id', ctx.user.id)
      return NextResponse.json({ success: true, tenders: [], count: 0, steps })
    }

    // Step 2: Groq enrichment — extract tender_number, deadline, ministry, is_specific
    steps.enrich = 'starting'
    const enriched = await enrichWithGroq(candidates)
    steps.enrich = { ok: true, enrichedCount: enriched.length }

    // Step 3: Build tender list
    const today = new Date().toISOString().slice(0, 10)
    let list = candidates.map((r, i) => {
      const e = enriched[i]
      const deadline = e.deadline || extractDateFromText(r.snippet + ' ' + r.date)
      const cleanTitle = r.title
        .replace(/\s*[-|–]\s*(gov\.il|mr\.gov\.il|ממשלת ישראל|מרכז רכש|ILG Site).*$/i, '')
        .trim() || r.title
      return {
        title: cleanTitle,
        organization: e.ministry
          || (r.url.includes('mr.gov.il') ? 'מרכז רכש ממשלתי'
          : r.url.includes('health.gov.il') ? 'משרד הבריאות'
          : r.url.includes('economy.gov.il') ? 'משרד הכלכלה'
          : r.url.includes('gov.il') ? 'ממשלת ישראל'
          : new URL(r.url).hostname.replace(/^www\./, '')),
        deadline,
        budget: 'לא צוין',
        description: r.snippet.slice(0, 300),
        link: r.url,
        relevance_score: 75,
        _is_specific: e.is_specific,
      }
    })

    // Filter: Groq says this is a listing page → drop it
    list = list.filter(t => t._is_specific)
    // Filter: known expired
    list = list.filter(t => !t.deadline || t.deadline >= today)
    list = deduplicateByField(list, 'link')
    steps.build = { ok: true, count: list.length }

    // Save to DB
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
