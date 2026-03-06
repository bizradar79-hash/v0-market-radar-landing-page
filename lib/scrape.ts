export async function scrapeWebsite(url: string): Promise<string> {
  if (!url) return ''
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MarketRadar/1.0)' },
      signal: AbortSignal.timeout(8000)
    })
    const html = await res.text()
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 5000)
  } catch { return '' }
}
