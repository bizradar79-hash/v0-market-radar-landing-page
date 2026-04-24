import type { TenderAdapter, NormalizedTender } from './types'

const SUBSCRIPTION_KEY = '5e64d66cf03f4547bcac5de2de06b566'
const API_URL = 'https://rail-api.rail.co.il/common/api/v1/Tenders/GetTendersByType?type=1'

function stripHtml(s: string | null | undefined): string {
  return String(s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

export const railAdapter: TenderAdapter = {
  siteName: 'רכבת ישראל',

  matchUrl: (url: string) => /rail\.co\.il/i.test(url),

  fetchTenders: async (): Promise<NormalizedTender[]> => {
    console.log('[rail-adapter] Fetching tenders from API...')

    const res = await fetch(API_URL, {
      headers: {
        'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      throw new Error(`Rail API HTTP ${res.status}`)
    }

    const data = await res.json()
    const items: any[] = data.result || []
    console.log(`[rail-adapter] API returned ${items.length} items`)

    const today = new Date().toISOString().split('T')[0]

    return items
      .filter(t => {
        if (!t.biddingDate) return true
        const deadline = t.biddingDate.split('T')[0]
        return deadline >= today
      })
      .map(t => ({
        external_id: `rail-${t.tenderNumber}`,
        title: stripHtml(t.tenderName),
        publisher: 'רכבת ישראל',
        description: stripHtml(t.description).slice(0, 500) || undefined,
        url: `https://rail.co.il/?page=generalauctions&step=openauctions&auctionId=${t.id}`,
        deadline: t.biddingDate ? t.biddingDate.split('T')[0] : null,
        publish_date: t.publishDate ? t.publishDate.split('T')[0] : null,
        category: 'תשתיות',
        tender_number: String(t.tenderNumber),
        tender_type: 'tender' as const,
        raw: t,
      }))
  },
}
