import type { TenderPoolItem } from './types'

// Search URL: all active tenders (non-archived), sorted by update date
// Pagination: &currentPage=0, &currentPage=1, etc.
const SEARCH_URL = 'https://mr.gov.il/ilgstorefront/he/search/'
const SEARCH_QUERY = '?q=%3AupdateDate%3Aarchive%3Afalse&text=&i=TENDER'
const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
  'Accept-Language': 'he-IL,he;q=0.9,en;q=0.5',
}

const EXEMPTION_KEYWORDS = ['כוונה להתקשרות', 'הודעת פטור', 'פטור ממכרז', 'התקשרות ספק יחיד']
const STATUS_SKIP = ['הסתיים', 'בוטל', 'חלף']

function isExemptionContext(text: string): boolean {
  return EXEMPTION_KEYWORDS.some(kw => text.includes(kw))
}

function isSkippedStatus(text: string): boolean {
  return STATUS_SKIP.some(kw => text.includes(kw))
}

async function scrapeSearchPage(page: number): Promise<{ ids: string[]; hasMore: boolean }> {
  const url = `${SEARCH_URL}${SEARCH_QUERY}&currentPage=${page}`
  console.log(`[mr-gov] Fetching page ${page}: ${url.substring(0, 100)}...`)

  const res = await fetch(url, {
    headers: FETCH_HEADERS,
    signal: AbortSignal.timeout(20000),
  })

  if (!res.ok) {
    console.warn(`[mr-gov] Page ${page} returned ${res.status}`)
    return { ids: [], hasMore: false }
  }

  const html = await res.text()
  console.log(`[mr-gov] Page ${page} HTML: ${html.length} chars`)

  // Extract tender IDs from links
  const linkRegex = /href="\/ilgstorefront\/he\/p\/(\d+)"/g
  const ids: string[] = []
  let match

  while ((match = linkRegex.exec(html)) !== null) {
    const tenderId = match[1]

    // Check surrounding context for exemption/status markers
    const pos = match.index
    const context = html.slice(Math.max(0, pos - 600), pos + 600)

    if (isSkippedStatus(context)) continue
    if (isExemptionContext(context)) {
      console.log(`[mr-gov] Skipping exemption: ${tenderId}`)
      continue
    }

    ids.push(tenderId)
  }

  // Check if there's a "next page" link
  const hasMore = html.includes(`currentPage=${page + 1}`) ||
                  html.includes('class="pagination-next"') ||
                  html.includes('class="next"')

  return { ids, hasMore }
}

export async function scrapeMrGov(): Promise<TenderPoolItem[]> {
  const seenIds = new Set<string>()
  const tenders: TenderPoolItem[] = []
  const maxPages = 20 // safety limit (20 results/page × 20 = 400 tenders max)

  console.log('[mr-gov] === Starting full tender scan ===')

  for (let page = 0; page < maxPages; page++) {
    try {
      const { ids, hasMore } = await scrapeSearchPage(page)

      if (ids.length === 0 && page > 0) {
        console.log(`[mr-gov] Page ${page}: no results, stopping pagination`)
        break
      }

      let newOnPage = 0
      for (const id of ids) {
        if (seenIds.has(id)) continue
        seenIds.add(id)
        newOnPage++

        tenders.push({
          external_id: id,
          title: `מכרז ${id}`,
          url: `https://mr.gov.il/ilgstorefront/he/p/${id}`,
          category: 'שירותים ציבוריים',
          raw_data: { source: 'mr.gov.il', page },
        })
      }

      console.log(`[mr-gov] Page ${page}: ${ids.length} IDs found, ${newOnPage} new, total: ${tenders.length}`)

      if (!hasMore) {
        console.log(`[mr-gov] No more pages after ${page}`)
        break
      }

      // Small delay between pages to be polite
      await new Promise(r => setTimeout(r, 500))
    } catch (err: any) {
      console.warn(`[mr-gov] Error on page ${page}:`, err?.message)
      if (page === 0) break // if first page fails, don't bother continuing
    }
  }

  console.log(`[mr-gov] === Scan complete: ${tenders.length} tenders from ${seenIds.size} unique IDs ===`)
  return tenders
}
