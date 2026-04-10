export interface TenderResult {
  title: string
  url: string
  publisher: string
  deadline: string
  procedure_number: string
  status: string
  source: string
}

export async function scrapeMrGov(keywords: string[]): Promise<TenderResult[]> {
  const allResults: TenderResult[] = []

  for (const keyword of keywords.slice(0, 3)) {
    let html = ''
    try {
      const url = `https://mr.gov.il/ilgstorefront/he/search/?text=${encodeURIComponent(keyword)}&s=TENDER&q=%3Aarchive%3Afalse`
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'he-IL,he;q=0.9',
        },
        // 10s timeout via AbortSignal
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) {
        console.warn(`[scrapeMrGov] HTTP ${res.status} for keyword="${keyword}"`)
        continue
      }
      html = await res.text()
    } catch (e: any) {
      console.warn(`[scrapeMrGov] fetch failed for keyword="${keyword}":`, e?.message)
      continue
    }

    // Parse each item block — split on <li ...class="...product...">
    const itemBlocks = html.split(/<li[^>]*class="[^"]*product[^"]*"/)

    for (const block of itemBlocks.slice(1)) {
      // Extract link + tender ID + title
      const linkMatch = block.match(/href="(\/ilgstorefront\/he\/p\/(\d+))"[^>]*>([^<]{5,})/)
      if (!linkMatch) continue

      const tenderId = linkMatch[2]
      const title = linkMatch[3].trim()
      const fullUrl = `https://mr.gov.il${linkMatch[1]}`

      const publisherMatch = block.match(/שם המפרסם[:\s]+([^|<\n]+)/)
      const statusMatch = block.match(/סטטוס[:\s]+([^|<\n]+)/)
      const deadlineMatch = block.match(/תאריך הגש[^:]*[:\s]+(\d{2}\/\d{2}\/\d{4})/)
      const procedureMatch = block.match(/מס[׳']\s*הליך[:\s]+([^\s|<]+)/)

      const status = statusMatch?.[1]?.trim() || ''

      // Skip expired / archived tenders
      if (status.includes('חלף') || status.includes('ארכיון')) continue

      // Parse deadline and skip past deadlines
      let deadline = ''
      if (deadlineMatch?.[1]) {
        const [day, month, year] = deadlineMatch[1].split('/')
        const deadlineDate = new Date(`${year}-${month}-${day}`)
        if (deadlineDate < new Date()) continue
        deadline = deadlineMatch[1] // keep DD/MM/YYYY for display
      }

      allResults.push({
        title: title.substring(0, 200),
        url: fullUrl,
        publisher: publisherMatch?.[1]?.trim() || 'מינהל הרכש הממשלתי',
        deadline,
        procedure_number: procedureMatch?.[1]?.trim() || tenderId,
        status,
        source: 'mr.gov.il',
      })
    }

    console.log(`[scrapeMrGov] keyword="${keyword}" → ${allResults.length} total so far`)
  }

  // Deduplicate by URL
  const seen = new Set<string>()
  return allResults
    .filter(r => {
      if (seen.has(r.url)) return false
      seen.add(r.url)
      return true
    })
    .slice(0, 15)
}
