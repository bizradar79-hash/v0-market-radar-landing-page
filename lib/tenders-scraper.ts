export interface TenderResult {
  title: string
  url: string
  publisher: string
  deadline: string
  procedure_number: string
  status: string
  source: string
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

// Extract the value of a "LABEL:</span><span ...>VALUE</span>" field within a block.
function extractField(block: string, labelPattern: string): string {
  const re = new RegExp(
    labelPattern + '\\s*:?\\s*(?:&nbsp;|\\s)*<\\/span>\\s*<span[^>]*>\\s*([^<]+?)\\s*<\\/span>'
  )
  const m = block.match(re)
  return m ? decodeEntities(m[1]).trim() : ''
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

    console.log(`[scrapeMrGov] keyword="${keyword}" HTML length:`, html.length)

    // Each result is an <a href="/ilgstorefront/he/p/ID"><h2>TITLE</h2></a>.
    // Capture the anchor's inner HTML (the title lives in a nested element).
    const anchorPattern = /<a\s+href="(\/ilgstorefront\/he\/p\/(\d+))"[^>]*>([\s\S]*?)<\/a>/g
    let m: RegExpExecArray | null
    const seenIds = new Set<string>()
    let foundCount = 0

    while ((m = anchorPattern.exec(html)) !== null) {
      const tenderId = m[2]
      const title = stripTags(m[3])
      const fullUrl = `https://mr.gov.il${m[1]}`
      if (!title || seenIds.has(tenderId)) continue
      seenIds.add(tenderId)
      foundCount++

      // Details live in the block AFTER the anchor.
      const idx = m.index
      const block = html.slice(idx, Math.min(html.length, idx + 2500))

      const publisher = extractField(block, 'שם המפרסם')
      const status = extractField(block, 'סטטוס')
      const procedure = extractField(block, "מס[׳'’]\\s*הליך")

      if (status.includes('חלף') || status.includes('ארכיון')) continue

      // Deadline label is "מועד אחרון להגשה"; value may include a time → take date.
      const deadlineRaw = extractField(block, 'מועד אחרון להגשה')
      const deadlineDateMatch = deadlineRaw.match(/(\d{2}\/\d{2}\/\d{4})/)
      let deadline = ''
      if (deadlineDateMatch) {
        const [day, month, year] = deadlineDateMatch[1].split('/')
        const deadlineDate = new Date(`${year}-${month}-${day}`)
        if (deadlineDate < new Date()) continue
        deadline = deadlineDateMatch[1]
      }

      allResults.push({
        title: title.substring(0, 200),
        url: fullUrl,
        publisher: publisher || 'מינהל הרכש הממשלתי',
        deadline,
        procedure_number: procedure || tenderId,
        status,
        source: 'mr.gov.il',
      })
    }

    console.log(`[scrapeMrGov] keyword="${keyword}" found ${foundCount} links → ${allResults.length} total so far`)
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
