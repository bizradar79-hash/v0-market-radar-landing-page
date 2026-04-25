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
    console.log('[rail-adapter] Starting fetch from:', API_URL)

    let res: Response
    try {
      res = await fetch(API_URL, {
        headers: {
          'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(15000),
      })
    } catch (err: any) {
      console.error('[rail-adapter] FETCH FAILED:', err?.message, 'cause:', err?.cause?.code || 'unknown')
      throw new Error(`Rail API fetch failed: ${err?.message} (${err?.cause?.code || 'unknown'})`)
    }

    console.log('[rail-adapter] Response status:', res.status)

    const text = await res.text()
    console.log('[rail-adapter] Response body length:', text.length)
    console.log('[rail-adapter] Body first 500:', text.slice(0, 500))

    if (!res.ok) {
      throw new Error(`Rail API HTTP ${res.status}: ${text.slice(0, 200)}`)
    }

    let data: any
    try {
      data = JSON.parse(text)
    } catch (err: any) {
      console.error('[rail-adapter] JSON parse failed:', err?.message)
      throw new Error(`Rail API returned non-JSON: ${text.slice(0, 100)}`)
    }

    const raw: any[] = data.result || data.Result || []
    console.log('[rail-adapter] raw items count:', raw.length)
    if (raw.length > 0) {
      console.log('[rail-adapter] First item keys:', Object.keys(raw[0]).join(', '))
      console.log('[rail-adapter] First item sample:', JSON.stringify(raw[0]).slice(0, 500))
    }

    const today = new Date().toISOString().split('T')[0]
    console.log('[rail-adapter] Today:', today)

    let expiredCount = 0
    const filtered = raw.filter(t => {
      if (!t.biddingDate) return true
      const deadline = t.biddingDate.split('T')[0]
      const keep = deadline >= today
      if (!keep) expiredCount++
      return keep
    })
    console.log(`[rail-adapter] After filter: ${filtered.length} active, ${expiredCount} expired dropped`)

    const mapped = filtered.map(t => ({
      external_id: `rail-${t.tenderNumber || t.id}`,
      title: stripHtml(t.tenderName || t.name),
      publisher: 'רכבת ישראל',
      description: stripHtml(t.description).slice(0, 500) || undefined,
      url: `https://rail.co.il/?page=generalauctions&step=openauctions&auctionId=${t.id}`,
      deadline: t.biddingDate ? t.biddingDate.split('T')[0] : null,
      publish_date: t.publishDate ? t.publishDate.split('T')[0] : null,
      category: 'תשתיות',
      tender_number: String(t.tenderNumber || t.id),
      tender_type: 'tender' as const,
      raw: t,
    }))

    console.log('[rail-adapter] Returning', mapped.length, 'tenders')
    if (mapped.length > 0) {
      console.log('[rail-adapter] First mapped:', JSON.stringify({ id: mapped[0].external_id, title: mapped[0].title?.slice(0, 60), deadline: mapped[0].deadline }))
    }

    return mapped
  },
}
