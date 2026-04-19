import type { TenderPoolItem } from './types'

const KEYWORDS = ['שירותים', 'רכש', 'אספקה', 'ייעוץ', 'תחזוקה', 'פיתוח']
const BASE_URL = 'https://mr.gov.il/ilgstorefront/he/search/'
const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
  'Accept-Language': 'he-IL,he;q=0.9,en;q=0.5',
}

function parseDate(text: string): string | undefined {
  const match = text.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/)
  if (match) {
    const [, d, m, y] = match
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return undefined
}

function extractText(html: string, pattern: RegExp): string | undefined {
  const match = html.match(pattern)
  return match?.[1]?.replace(/<[^>]+>/g, '').trim() || undefined
}

async function fetchTenderDetails(tenderId: string): Promise<{
  title?: string
  publisher?: string
  deadline?: string
  publish_date?: string
  description?: string
}> {
  try {
    const res = await fetch(`https://mr.gov.il/ilgstorefront/he/p/${tenderId}`, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return {}
    const html = await res.text()

    // Title: try <h1>, then <title>, then og:title
    const title = extractText(html, /<h1[^>]*>([^<]+)<\/h1>/) ||
                  extractText(html, /<title>([^<]+)<\/title>/) ||
                  extractText(html, /property="og:title"\s+content="([^"]+)"/)

    // Publisher: look for שם המפרסם, גוף מפרסם, משרד, etc.
    const publisher = extractText(html, /(?:שם\s*(?:ה)?מפרסם|גוף\s*מפרסם|משרד)[^<]*?<[^>]*>([^<]+)/) ||
                      extractText(html, /(?:שם\s*(?:ה)?מפרסם|גוף\s*מפרסם)[:\s]*([^<\n]{3,80})/) ||
                      extractText(html, /class="[^"]*(?:publisher|ministry|organ)[^"]*"[^>]*>([^<]+)/)

    // Deadline: תאריך הגשה / תאריך אחרון
    const deadlineBlock = html.match(/(?:תאריך\s*(?:אחרון|הגשה|סיום|אחרון\s*להגשה))[^]*?(\d{1,2}[./]\d{1,2}[./]\d{4})/)?.[1]
    const deadline = deadlineBlock ? parseDate(deadlineBlock) : undefined

    // Publish date: תאריך פרסום
    const publishBlock = html.match(/(?:תאריך\s*פרסום)[^]*?(\d{1,2}[./]\d{1,2}[./]\d{4})/)?.[1]
    const publish_date = publishBlock ? parseDate(publishBlock) : undefined

    // Description: meta description or first significant paragraph
    const description = extractText(html, /name="description"\s+content="([^"]+)"/) ||
                        extractText(html, /property="og:description"\s+content="([^"]+)"/) ||
                        extractText(html, /<p[^>]*class="[^"]*(?:desc|summary|content)[^"]*"[^>]*>([^<]{20,300})/)

    return { title, publisher, deadline, publish_date, description }
  } catch (err: any) {
    console.warn(`[mr-gov] Failed to fetch details for ${tenderId}:`, err?.message)
    return {}
  }
}

export async function scrapeMrGov(): Promise<TenderPoolItem[]> {
  const tenders: TenderPoolItem[] = []
  const seenIds = new Set<string>()
  const today = new Date().toISOString().split('T')[0]

  for (const keyword of KEYWORDS) {
    try {
      const url = `${BASE_URL}?text=${encodeURIComponent(keyword)}&q=%3Arelevance%3AitemType%3Atender`
      console.log(`[mr-gov] Searching: ${keyword}`)
      const res = await fetch(url, {
        headers: FETCH_HEADERS,
        signal: AbortSignal.timeout(15000),
      })

      if (!res.ok) {
        console.warn(`[mr-gov] Search "${keyword}" returned ${res.status}`)
        continue
      }

      const html = await res.text()
      console.log(`[mr-gov] Search "${keyword}" HTML length: ${html.length}`)

      // Extract tender links: /ilgstorefront/he/p/{id}
      const linkRegex = /href="\/ilgstorefront\/he\/p\/(\d+)"/g
      let match
      const idsFromSearch: string[] = []

      while ((match = linkRegex.exec(html)) !== null) {
        const tenderId = match[1]
        if (seenIds.has(tenderId)) continue
        seenIds.add(tenderId)

        // Check for expired status in surrounding context
        const pos = match.index
        const context = html.slice(Math.max(0, pos - 500), pos + 500)
        if (context.includes('חלף') || context.includes('בוטל')) continue

        // Try to extract from search result card first
        const searchTitle = extractText(context, />([^<]{10,200})<\/a>/) ||
                            extractText(context, /class="[^"]*(?:tender|item)[^"]*title[^"]*"[^>]*>([^<]+)/) ||
                            extractText(context, /class="[^"]*name[^"]*"[^>]*>([^<]+)/)

        const searchPublisher = extractText(context, /class="[^"]*(?:publisher|ministry|organ)[^"]*"[^>]*>([^<]+)/)

        const searchDeadline = (() => {
          const m = context.match(/(?:תאריך\s*(?:אחרון|הגשה|סיום))[^]*?(\d{1,2}[./]\d{1,2}[./]\d{4})/)
          return m ? parseDate(m[1]) : undefined
        })()

        // Skip if deadline in search results is past
        if (searchDeadline && searchDeadline < today) continue

        idsFromSearch.push(tenderId)

        // Store preliminary data from search results
        tenders.push({
          external_id: tenderId,
          title: searchTitle || `מכרז ${tenderId}`,
          publisher: searchPublisher,
          deadline: searchDeadline,
          url: `https://mr.gov.il/ilgstorefront/he/p/${tenderId}`,
          category: 'שירותים ציבוריים',
          raw_data: { keyword, source: 'mr.gov.il', from_search: true },
        })
      }

      console.log(`[mr-gov] Keyword "${keyword}": found ${idsFromSearch.length} tender IDs`)
    } catch (err: any) {
      console.warn(`[mr-gov] Error scraping keyword "${keyword}":`, err?.message)
    }
  }

  // Enrich: fetch individual pages for tenders with missing data (limit to 10 to avoid timeouts)
  const needsEnrichment = tenders.filter(t =>
    t.title.startsWith('מכרז ') || !t.publisher || !t.deadline
  ).slice(0, 10)

  console.log(`[mr-gov] Enriching ${needsEnrichment.length} tenders with detail pages`)

  for (const tender of needsEnrichment) {
    const details = await fetchTenderDetails(tender.external_id)
    const idx = tenders.findIndex(t => t.external_id === tender.external_id)
    if (idx === -1) continue

    if (details.title) tenders[idx].title = details.title
    if (details.publisher) tenders[idx].publisher = details.publisher
    if (details.deadline) tenders[idx].deadline = details.deadline
    if (details.publish_date) tenders[idx].publish_date = details.publish_date
    if (details.description) tenders[idx].description = details.description
    tenders[idx].raw_data = { ...tenders[idx].raw_data, enriched: true, details }
  }

  // Final filter: remove past deadlines found during enrichment
  const result = tenders.filter(t => !t.deadline || t.deadline >= today)

  console.log(`[mr-gov] Final: ${result.length} tenders (enriched ${needsEnrichment.length})`)
  return result
}
