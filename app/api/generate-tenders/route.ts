import { getFullContext } from '@/lib/context'
import { analyzeWithAI, validateUrl } from '@/lib/ai'
import { search } from '@/lib/search'
import { scrapeWebsite } from '@/lib/scrape'
import { deduplicateByField } from '@/lib/dedup'
import { NextResponse } from 'next/server'

export const maxDuration = 60

function isValidDate(d: string | null | undefined): boolean {
  return !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d))
}

function cleanForPrompt(text: string): string {
  return text
    .replace(/[^\u0590-\u05FF\u0020-\u007E\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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

    const currentYear = new Date().getFullYear()
    const [r1, r2] = await Promise.all([
      search(`מכרז ${industry} ${products} site:mr.gov.il ${currentYear}`, 10),
      search(`מכרז ${products} site:mr.gov.il OR site:tenders.gov.il ${currentYear}`, 10),
    ])

    const seen = new Set<string>()
    const allResults = [...r1, ...r2].filter(r => {
      if (!r.url || seen.has(r.url)) return false
      seen.add(r.url)
      return true
    }).slice(0, 5)

    steps.search = { ok: true, count: allResults.length }

    if (allResults.length === 0) {
      await ctx.supabase.from('tenders').delete().eq('company_id', ctx.user.id)
      steps.ai = { ok: true, count: 0, reason: 'no search results' }
      return NextResponse.json({ success: true, tenders: [], count: 0, steps })
    }

    // Scrape each page — fall back to search snippet on error
    steps.scrape = 'starting'
    const scraped = await Promise.all(
      allResults.map(async (r) => {
        let content = r.content
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

    // AI extracts structured data — permissive, not strict
    steps.ai = 'starting'
    let list: any[] = []
    try {
      const data = await analyzeWithAI(`Extract tender/procurement details from the search results below.
If anything looks like a government or corporate procurement tender, include it. Be permissive not strict.

Company: ${cleanForPrompt(companyName)}, Industry: ${cleanForPrompt(industry)}

Results:
${scraped.map((s, i) => `[${i + 1}] URL: ${s.url}\nTitle: ${s.title}\nContent: ${s.content}`).join('\n\n')}

Rules:
- link must be one of the URLs listed above exactly
- deadline: look for Hebrew date patterns: "תאריך הגשה", "מועד אחרון", "תוקף", "הגשת הצעות". Extract as YYYY-MM-DD or null
- If nothing found return tenders: []

{"tenders":[{"title":"tender title","organization":"org name","deadline":"2026-06-01","budget":"not specified","description":"brief description","link":"exact URL from above","relevance_score":75}]}`)
      list = Array.isArray(data?.tenders) ? data.tenders : []
    } catch (aiErr: any) {
      steps.ai = { ok: false, error: aiErr?.message?.slice(0, 100) }
    }

    steps.ai = { ...steps.ai, count: list.length }

    // Filter to URLs we actually have
    const resultUrls = new Set(scraped.map(s => s.url))
    list = list.filter((t: any) => t.link && resultUrls.has(t.link))
    list = deduplicateByField(list, 'link')

    // Fallback: if AI returned 0, save search results directly as tenders
    if (list.length === 0) {
      steps.ai = { ...steps.ai, fallback: true }
      list = scraped.map(s => ({
        title: s.title || 'מכרז',
        organization: 'לא צוין',
        deadline: null,
        budget: 'לא צוין',
        description: s.content.slice(0, 200) || '',
        link: s.url,
        relevance_score: 60,
      }))
    }

    // Validate URLs reachable
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
