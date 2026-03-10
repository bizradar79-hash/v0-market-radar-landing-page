import { getFullContext } from '@/lib/context'
import { analyzeWithAI, validateUrl } from '@/lib/ai'
import { search } from '@/lib/search'
import { scrapeWebsite } from '@/lib/scrape'
import { deduplicateByField } from '@/lib/dedup'
import { NextResponse } from 'next/server'

export const maxDuration = 60

const TENDER_SITES = ['mr.gov.il', 'tenders.gov.il', 'procurement.gov.il']

function isValidDate(d: string | null | undefined): boolean {
  return !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d))
}

// Keep only Hebrew (\u0590-\u05FF), ASCII printable (0x20-0x7E), and basic punctuation
function cleanForPrompt(text: string): string {
  return text
    .replace(/[^\u0590-\u05FF\u0020-\u007E\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isTenderSiteUrl(url: string): boolean {
  if (!url) return false
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    return TENDER_SITES.some(s => host === s || host.endsWith('.' + s))
  } catch { return false }
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
    const companyName = ctx.company?.name || ''

    // Two targeted searches — one site-specific, one broader
    const [r1, r2] = await Promise.all([
      search(`מכרז ${industry} ${products} site:mr.gov.il OR site:tenders.gov.il`, 10),
      search(`מכרז ${companyName} ${products} ישראל 2025 2026`, 10),
    ])

    // Keep only results from known tender sites
    const seen = new Set<string>()
    const tenderResults = [...r1, ...r2]
      .filter(r => isTenderSiteUrl(r.url))
      .filter(r => { if (seen.has(r.url)) return false; seen.add(r.url); return true })
      .slice(0, 5) // max 5 pages to scrape within timeout

    steps.search = { ok: true, fromTenderSites: tenderResults.length }

    if (tenderResults.length === 0) {
      await ctx.supabase.from('tenders').delete().eq('company_id', ctx.user.id)
      steps.ai = { ok: true, count: 0, reason: 'no results from tender sites' }
      return NextResponse.json({ success: true, tenders: [], count: 0, steps })
    }

    // Scrape each tender page in parallel — fall back to search snippet on error
    steps.scrape = 'starting'
    const scraped = await Promise.all(
      tenderResults.map(async (r) => {
        let content = r.content // fallback: search snippet
        try {
          const raw = await scrapeWebsite(r.url)
          if (raw && raw.length > 50) content = raw
        } catch { /* keep search snippet */ }
        return {
          url: r.url,
          title: cleanForPrompt(r.title),
          content: cleanForPrompt(content).slice(0, 500),
        }
      })
    )
    steps.scrape = { ok: true, scraped: scraped.filter(s => s.content?.length > 20).length }

    // Use AI only to parse/extract — not to invent
    steps.ai = 'starting'
    const data = await analyzeWithAI(`Extract tender details ONLY from the pages below. Do NOT invent.

Company: ${cleanForPrompt(companyName)}, Industry: ${cleanForPrompt(industry)}

Pages:
${scraped.map((s, i) => `=== PAGE ${i + 1} ===\nURL: ${s.url}\nTitle: ${s.title}\nContent: ${s.content}`).join('\n')}

Rules:
- CRITICAL: Use ONLY data from the pages above. Do NOT invent any tender not shown.
- link must be one of the URLs listed above exactly
- Exclude job listings, news articles, product pages
- deadline: extract real date as YYYY-MM-DD or null if not found
- If no real tender found return tenders: []

{"tenders":[{"title":"full tender title","organization":"publisher","deadline":"2026-06-01","budget":"not specified","description":"description from page","link":"exact URL from above","relevance_score":80}]}`)

    let list = Array.isArray(data?.tenders) ? data.tenders : []
    steps.ai = { ok: true, count: list.length }

    // Hard filter: only URLs we actually scraped + from tender sites
    const scrapedUrls = new Set(scraped.map(s => s.url))
    list = list.filter((t: any) => t.link && scrapedUrls.has(t.link) && isTenderSiteUrl(t.link))
    list = deduplicateByField(list, 'link')

    // Validate URLs still reachable
    steps.validate = 'starting'
    const withValid = await Promise.all(
      list.map(async (t: any) => ({ ...t, _valid: await validateUrl(t.link) }))
    )
    list = withValid.filter(t => t._valid).map(({ _valid, ...t }) => t)
    steps.validate = { ok: true, kept: list.length }

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
        budget: t.budget || 'לא צוין',
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
