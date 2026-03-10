import { getFullContext } from '@/lib/context'
import { search } from '@/lib/search'
import { deduplicateByField } from '@/lib/dedup'
import { NextResponse } from 'next/server'

export const maxDuration = 60

function isValidDate(d: string | null | undefined): boolean {
  return !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d))
}

// Convert DD/MM/YYYY → YYYY-MM-DD
function parseHebrewDate(raw: string): string | null {
  const m = raw.match(/(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})/)
  if (!m) return null
  const [, dd, mm, yyyy] = m
  const iso = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
  return isValidDate(iso) ? iso : null
}

function cleanDescription(text: string): string {
  if (!text) return ''
  // Strip PDF binary, HTML entities, base64 garbage
  if (text.includes('0 obj') || text.includes('endobj') || text.includes('stream')) return ''
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, '')
    .replace(/&[a-z]+;/g, '')
    .replace(/[^\u0590-\u05FF\u0020-\u007E\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300)
}

// Fetch raw HTML and extract tender fields
async function extractTenderFromPage(url: string, fallbackTitle: string): Promise<{
  title: string
  deadline: string | null
  publishDate: string | null
  tenderNumber: string | null
  description: string
} | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MarketRadar/1.0)' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const html = await res.text()

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
      || html.match(/<h1[^>]*>([^<]+)<\/h1>/i)
    const title = titleMatch
      ? cleanDescription(titleMatch[1]).replace(/\s*[-|].*$/, '').trim()
      : fallbackTitle

    // Extract deadline: "מועד אחרון להגשה" or "תאריך אחרון"
    const deadlineMatch = html.match(/(?:מועד אחרון להגשה|תאריך אחרון|דדליין)[^\d]*(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{4})/i)
    const deadline = deadlineMatch ? parseHebrewDate(deadlineMatch[1]) : null

    // Extract publish date: "תאריך פרסום"
    const publishMatch = html.match(/תאריך פרסום[^\d]*(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{4})/i)
    const publishDate = publishMatch ? parseHebrewDate(publishMatch[1]) : null

    // Extract tender number: "מס' פרסום" or "מספר מכרז"
    const numMatch = html.match(/(?:מס['\u05F3]? פרסום|מספר מכרז)[^\d]*(\d[\d\-\/]+)/i)
    const tenderNumber = numMatch ? numMatch[1].trim() : null

    // Extract description: first paragraph of meaningful Hebrew text
    const descMatch = html.match(/<p[^>]*>([\u0590-\u05FF][^<]{30,300})<\/p>/i)
    const description = descMatch ? cleanDescription(descMatch[1]) : ''

    return { title: title || fallbackTitle, deadline, publishDate, tenderNumber, description }
  } catch {
    return null
  }
}

export async function POST() {
  const steps: Record<string, any> = {}
  try {
    steps.context = 'starting'
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized', steps }, { status: 401 })
    steps.context = { ok: true, company: ctx.company?.name }

    steps.search = 'starting'
    const { products, industry } = ctx.companyProfile
    const year = new Date().getFullYear()

    const [r1, r2] = await Promise.all([
      search(`site:mr.gov.il/ilgstorefront מכרז ${industry} ${year}`, 10),
      search(`site:mr.gov.il inurl:ilgstorefront מכרז ${products} ${year}`, 10),
    ])

    // Deduplicate and keep only mr.gov.il URLs
    const seen = new Set<string>()
    const tenderResults = [...r1, ...r2]
      .filter(r => r.url?.includes('mr.gov.il'))
      .filter(r => { if (seen.has(r.url)) return false; seen.add(r.url); return true })
      .slice(0, 6)

    steps.search = { ok: true, count: tenderResults.length }

    if (tenderResults.length === 0) {
      await ctx.supabase.from('tenders').delete().eq('company_id', ctx.user.id)
      return NextResponse.json({ success: true, tenders: [], count: 0, steps })
    }

    // Extract tender data directly from HTML — no AI
    steps.extract = 'starting'
    const extracted = await Promise.all(
      tenderResults.map(async (r) => {
        const parsed = await extractTenderFromPage(r.url, r.title)
        if (!parsed) return null
        const today = new Date().toISOString().slice(0, 10)
        const status = parsed.deadline
          ? (parsed.deadline > today ? 'פתוח' : 'סגור')
          : 'לא ידוע'
        return {
          title: parsed.title,
          organization: 'מרכז רכש ממשלתי',
          deadline: parsed.deadline,
          budget: 'לא צוין',
          description: parsed.description
            || (parsed.tenderNumber ? `מס׳ פרסום: ${parsed.tenderNumber}` : r.content || ''),
          link: r.url,
          relevance_score: 75,
          status,
        }
      })
    )

    let list = extracted.filter(Boolean) as any[]
    list = deduplicateByField(list, 'link')
    steps.extract = { ok: true, extracted: list.length }

    steps.db = 'starting'
    await ctx.supabase.from('tenders').delete().eq('company_id', ctx.user.id)

    if (list.length === 0) {
      steps.db = { ok: true, saved: 0 }
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
