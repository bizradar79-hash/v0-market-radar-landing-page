import * as cheerio from 'cheerio'
import type { TenderPoolItem } from './types'

const BASE_URL = 'https://mr.gov.il/ilgstorefront/he/search/'
const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
  'Accept-Language': 'he-IL,he;q=0.9,en;q=0.5',
}

// URL-encoded Hebrew statuses
const STATUS_PUBLISHED = '%D7%A4%D7%95%D7%A8%D7%A1%D7%9D' // פורסם
const STATUS_UPDATED = '%D7%A2%D7%95%D7%93%D7%9B%D7%9F'   // עודכן

// Exemption keywords to skip
const EXEMPTION_KEYWORDS = ['כוונה להתקשרות', 'הודעת פטור', 'פטור ממכרז', 'התקשרות ספק יחיד']

interface SearchConfig {
  type: 'TENDER' | 'CENTRALTENDER'
  status: string // URL-encoded status
  label: string  // for logging
}

// All 4 search combos
const SEARCH_CONFIGS: SearchConfig[] = [
  { type: 'TENDER', status: STATUS_PUBLISHED, label: 'TENDER/פורסם' },
  { type: 'TENDER', status: STATUS_UPDATED, label: 'TENDER/עודכן' },
  { type: 'CENTRALTENDER', status: STATUS_PUBLISHED, label: 'CENTRALTENDER/פורסם' },
  { type: 'CENTRALTENDER', status: STATUS_UPDATED, label: 'CENTRALTENDER/עודכן' },
]

function buildSearchUrl(config: SearchConfig, page: number): string {
  return `${BASE_URL}?q=%3AupdateDate%3Aarchive%3Afalse%3Astatus%3A${config.status}&text=&i=${config.type}&page=${page}`
}

function isExemption(text: string): boolean {
  return EXEMPTION_KEYWORDS.some(kw => text.includes(kw))
}

function normalizeDate(raw: string): string | null {
  const match = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!match) return null
  const [, d, m, y] = match
  const month = parseInt(m)
  const day = parseInt(d)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

interface ParsedCard {
  id: string
  title: string
  publisher: string | null
  publishDate: string | null
}

function parseResultCards(html: string): ParsedCard[] {
  const $ = cheerio.load(html)
  const cards: ParsedCard[] = []

  $('a[href*="/ilgstorefront/he/p/"]').each((_, el) => {
    const href = $(el).attr('href') || ''
    const idMatch = href.match(/\/ilgstorefront\/he\/p\/(\d+)/)
    if (!idMatch) return

    const id = idMatch[1]
    const title = $(el).find('h2.search-results-content-head').text().trim()
      || $(el).text().trim()

    if (!title || isExemption(title)) return

    // Navigate to the details wrapper after this link
    const wrapper = $(el).nextAll('.details-wrapper').first()
    if (!wrapper.length) {
      // Try parent context
      const parent = $(el).parent()
      const altWrapper = parent.find('.details-wrapper').first()
      if (altWrapper.length) {
        const publisher = extractField(altWrapper, 'שם המפרסם')
        const publishDate = extractField(altWrapper, 'תאריך פרסום')
        cards.push({
          id,
          title: cleanTitle(title),
          publisher,
          publishDate: publishDate ? normalizeDate(publishDate) : null,
        })
        return
      }
      cards.push({ id, title: cleanTitle(title), publisher: null, publishDate: null })
      return
    }

    const publisher = extractField(wrapper, 'שם המפרסם')
    const publishDate = extractField(wrapper, 'תאריך פרסום')

    cards.push({
      id,
      title: cleanTitle(title),
      publisher,
      publishDate: publishDate ? normalizeDate(publishDate) : null,
    })
  })

  return cards
}

function extractField($wrapper: cheerio.Cheerio<any>, label: string): string | null {
  const html = $wrapper.html() || ''
  // Pattern: <span>label:&nbsp;</span><span class="font-weight-normal">VALUE</span>
  const regex = new RegExp(`${label}[:\\s]*(?:&nbsp;)?<\\/span>\\s*<span[^>]*>([^<]+)`, 'u')
  const match = html.match(regex)
  return match?.[1]?.trim() || null
}

function cleanTitle(raw: string): string {
  // Collapse whitespace and newlines
  return raw.replace(/\s+/g, ' ').trim()
}

async function scrapeSearchConfig(config: SearchConfig): Promise<ParsedCard[]> {
  const allCards: ParsedCard[] = []
  const seenIds = new Set<string>()
  const maxPages = 50 // safety: 50 pages × 20 = 1000 max

  for (let page = 0; page < maxPages; page++) {
    const url = buildSearchUrl(config, page)

    try {
      const res = await fetch(url, {
        headers: FETCH_HEADERS,
        signal: AbortSignal.timeout(20000),
      })

      if (!res.ok) {
        console.warn(`[mr-gov] ${config.label} page ${page}: HTTP ${res.status}`)
        break
      }

      const html = await res.text()
      const cards = parseResultCards(html)

      if (cards.length === 0) {
        console.log(`[mr-gov] ${config.label} page ${page}: 0 results, stopping`)
        break
      }

      let newOnPage = 0
      for (const card of cards) {
        if (seenIds.has(card.id)) continue
        seenIds.add(card.id)
        allCards.push(card)
        newOnPage++
      }

      console.log(`[mr-gov] ${config.label} page ${page}: ${cards.length} cards, ${newOnPage} new`)

      if (cards.length < 20) {
        // Last page (less than full page of results)
        break
      }

      // Polite delay between pages
      await new Promise(r => setTimeout(r, 300))
    } catch (err: any) {
      console.warn(`[mr-gov] ${config.label} page ${page} error:`, err?.message)
      if (page === 0) break
    }
  }

  return allCards
}

export async function scrapeMrGov(): Promise<TenderPoolItem[]> {
  console.log('[mr-gov] === Starting full tender scan (4 queries) ===')

  const seenIds = new Set<string>()
  const tenders: TenderPoolItem[] = []

  for (const config of SEARCH_CONFIGS) {
    console.log(`[mr-gov] Scanning: ${config.label}`)
    const cards = await scrapeSearchConfig(config)

    for (const card of cards) {
      if (seenIds.has(card.id)) continue
      seenIds.add(card.id)

      tenders.push({
        external_id: card.id,
        title: card.title,
        publisher: card.publisher || undefined,
        publish_date: card.publishDate || undefined,
        url: `https://mr.gov.il/ilgstorefront/he/p/${card.id}`,
        category: 'שירותים ציבוריים',
        raw_data: { source: 'mr.gov.il' },
      })
    }

    console.log(`[mr-gov] ${config.label}: ${cards.length} cards, total unique so far: ${tenders.length}`)
  }

  console.log(`[mr-gov] === Scan complete: ${tenders.length} unique tenders ===`)
  return tenders
}
