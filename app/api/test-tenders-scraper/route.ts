export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { scrapeMrGov } from '@/lib/tenders-scraper'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const keyword = searchParams.get('q') || 'ייעוץ משפטי'
  const keywords = keyword.split(',').map(k => k.trim()).filter(Boolean)

  const start = Date.now()
  const results = await scrapeMrGov(keywords)
  const elapsed = Date.now() - start

  return Response.json({ count: results.length, elapsed_ms: elapsed, keywords, results })
}
