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
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
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

    // Debug: log what we actually got
    console.log(`[scrapeMrGov] keyword="${keyword}" HTML length:`, html.length)
    console.log(`[scrapeMrGov] HTML sample:`, html.substring(0, 500))
    console.log(`[scrapeMrGov] Has /p/ links:`, html.includes('/ilgstorefront/he/p/'))
    console.log(`[scrapeMrGov] Has product class:`, html.includes('product'))
    console.log(`[scrapeMrGov] Has TENDER:`, html.includes('TENDER'))

    // Strategy 1: look for all /ilgstorefront/he/p/DIGITS links
    const linkPattern = /href="(\/ilgstorefront\/he\/p\/(\d+))"[^>]*>([^<]{5,})/g
    let m: RegExpExecArray | null
    const foundByLinks = new Map<string, { tenderId: string; title: string; fullUrl: string }>()

    while ((m = linkPattern.exec(html)) !== null) {
      const tenderId = m[2]
      const title = m[3].trim()
      const fullUrl = `https://mr.gov.il${m[1]}`
      if (!foundByLinks.has(tenderId)) {
        foundByLinks.set(tenderId, { tenderId, title, fullUrl })
      }
    }

    console.log(`[scrapeMrGov] keyword="${keyword}" found ${foundByLinks.size} /p/ links`)

    if (foundByLinks.size > 0) {
      // We have direct links — extract additional info from surrounding context
      for (const { tenderId, title, fullUrl } of foundByLinks.values()) {
        // Find the block around this URL in the HTML
        const idx = html.indexOf(`/ilgstorefront/he/p/${tenderId}`)
        const blockStart = Math.max(0, idx - 1000)
        const blockEnd = Math.min(html.length, idx + 2000)
        const block = html.slice(blockStart, blockEnd)

        const publisherMatch = block.match(/שם המפרסם[:\s]+([^|<\n]{2,60})/)
        const statusMatch = block.match(/סטטוס[:\s]+([^|<\n]{2,30})/)
        const deadlineMatch = block.match(/תאריך הגש[^:]*[:\s]+(\d{2}\/\d{2}\/\d{4})/)
        const procedureMatch = block.match(/מס[׳']\s*הליך[:\s]+([^\s|<]{3,30})/)

        const status = statusMatch?.[1]?.trim() || ''
        if (status.includes('חלף') || status.includes('ארכיון')) continue

        let deadline = ''
        if (deadlineMatch?.[1]) {
          const [day, month, year] = deadlineMatch[1].split('/')
          const deadlineDate = new Date(`${year}-${month}-${day}`)
          if (deadlineDate < new Date()) continue
          deadline = deadlineMatch[1]
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
    } else {
      // Strategy 2: split on <li class="...product..."> blocks (original approach)
      const itemBlocks = html.split(/<li[^>]*class="[^"]*product[^"]*"/)
      console.log(`[scrapeMrGov] keyword="${keyword}" strategy2 blocks:`, itemBlocks.length - 1)

      for (const block of itemBlocks.slice(1)) {
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
        if (status.includes('חלף') || status.includes('ארכיון')) continue

        let deadline = ''
        if (deadlineMatch?.[1]) {
          const [day, month, year] = deadlineMatch[1].split('/')
          const deadlineDate = new Date(`${year}-${month}-${day}`)
          if (deadlineDate < new Date()) continue
          deadline = deadlineMatch[1]
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
