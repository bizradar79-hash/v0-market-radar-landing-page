import type { TenderPoolItem } from './types'

const KEYWORDS = ['שירותים', 'רכש', 'אספקה', 'ייעוץ', 'תחזוקה', 'פיתוח']
const BASE_URL = 'https://mr.gov.il/ilgstorefront/he/search/'

function parseDate(text: string): string | undefined {
  // Try DD/MM/YYYY or DD.MM.YYYY
  const match = text.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/)
  if (match) {
    const [, d, m, y] = match
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return undefined
}

export async function scrapeMrGov(): Promise<TenderPoolItem[]> {
  const tenders: TenderPoolItem[] = []
  const seenIds = new Set<string>()

  for (const keyword of KEYWORDS) {
    try {
      const url = `${BASE_URL}?text=${encodeURIComponent(keyword)}&q=%3Arelevance%3AitemType%3Atender`
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'he-IL,he;q=0.9',
        },
        signal: AbortSignal.timeout(15000),
      })

      if (!res.ok) {
        console.warn(`[mr-gov] Search "${keyword}" returned ${res.status}`)
        continue
      }

      const html = await res.text()

      // Extract tender links: /ilgstorefront/he/p/{id}
      const linkRegex = /href="\/ilgstorefront\/he\/p\/(\d+)"/g
      let match

      while ((match = linkRegex.exec(html)) !== null) {
        const tenderId = match[1]
        if (seenIds.has(tenderId)) continue
        seenIds.add(tenderId)

        // Extract surrounding context for this tender
        const pos = match.index
        const context = html.slice(Math.max(0, pos - 500), pos + 500)

        // Check for expired status
        if (context.includes('חלף')) continue

        // Try to extract title from nearby text
        const titleMatch = context.match(/class="[^"]*tender[^"]*title[^"]*"[^>]*>([^<]+)/) ||
                           context.match(/class="[^"]*name[^"]*"[^>]*>([^<]+)/) ||
                           context.match(/>([^<]{10,100})<\/a>/)
        const title = titleMatch?.[1]?.trim() || `מכרז ${tenderId}`

        // Try to extract publisher
        const publisherMatch = context.match(/class="[^"]*publisher[^"]*"[^>]*>([^<]+)/) ||
                               context.match(/class="[^"]*ministry[^"]*"[^>]*>([^<]+)/) ||
                               context.match(/class="[^"]*organ[^"]*"[^>]*>([^<]+)/)
        const publisher = publisherMatch?.[1]?.trim()

        // Try to extract deadline
        const deadlineText = context.match(/(?:תאריך\s*(?:אחרון|הגשה|סיום))[^<]*?(\d{1,2}[./]\d{1,2}[./]\d{4})/)
        const deadline = deadlineText ? parseDate(deadlineText[1]) : undefined

        // Skip if deadline is in the past
        if (deadline && deadline < new Date().toISOString().split('T')[0]) continue

        tenders.push({
          external_id: tenderId,
          title,
          publisher,
          deadline,
          url: `https://mr.gov.il/ilgstorefront/he/p/${tenderId}`,
          category: 'שירותים ציבוריים',
          raw_data: { keyword, source: 'mr.gov.il' },
        })
      }
    } catch (err: any) {
      console.warn(`[mr-gov] Error scraping keyword "${keyword}":`, err?.message)
    }
  }

  console.log(`[mr-gov] Found ${tenders.length} tenders`)
  return tenders
}
