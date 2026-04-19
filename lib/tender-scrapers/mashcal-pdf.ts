import type { TenderPoolItem } from './types'

const LIST_URL = 'https://www.mashcal.co.il/published-tenders/'
const JOB_KEYWORDS = ['דרוש/ה', 'דרושה', 'דרוש', 'משרה', 'כוח אדם', 'גיוס']

function parseDate(text: string): string | undefined {
  const match = text.match(/(\d{1,2})[./](\d{1,2})[./](\d{2,4})/)
  if (match) {
    let [, d, m, y] = match
    if (y.length === 2) y = '20' + y
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return undefined
}

function isJobPosting(text: string): boolean {
  return JOB_KEYWORDS.some(kw => text.includes(kw))
}

export async function scrapeMashcalPdfs(): Promise<TenderPoolItem[]> {
  const tenders: TenderPoolItem[] = []

  // Step 1: Fetch the tenders listing page
  let html: string
  try {
    const res = await fetch(LIST_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      console.warn(`[mashcal-pdf] List page returned ${res.status}`)
      return []
    }
    html = await res.text()
    console.log(`[mashcal-pdf] List page HTML length: ${html.length}`)
  } catch (err: any) {
    console.warn('[mashcal-pdf] Failed to fetch list page:', err?.message)
    return []
  }

  // Step 2: Extract PDF links — try multiple patterns
  const pdfUrls: string[] = []
  // Pattern 1: meshek-NN-2026.pdf
  const pdfRegex1 = /href="([^"]*meshek-\d+-2026\.pdf[^"]*)"/gi
  // Pattern 2: any PDF link on the page
  const pdfRegex2 = /href="([^"]*\.pdf[^"]*)"/gi
  // Pattern 3: links with "מכרזים" in anchor text
  const pdfRegex3 = /href="([^"]+)"[^>]*>[^<]*(?:מכרז|meshek)[^<]*/gi

  const seenUrls = new Set<string>()
  for (const regex of [pdfRegex1, pdfRegex2, pdfRegex3]) {
    let match
    while ((match = regex.exec(html)) !== null) {
      let pdfUrl = match[1]
      if (!pdfUrl.endsWith('.pdf')) continue
      if (!pdfUrl.startsWith('http')) {
        pdfUrl = new URL(pdfUrl, LIST_URL).href
      }
      if (seenUrls.has(pdfUrl)) continue
      seenUrls.add(pdfUrl)
      pdfUrls.push(pdfUrl)
    }
  }

  console.log(`[mashcal-pdf] Found PDFs: ${pdfUrls.length}. Processing: ${pdfUrls.slice(0, 3).map(u => u.split('/').pop()).join(', ')}`)

  // Step 3: Process the 3 most recent PDFs — always process, use upsert
  for (const pdfUrl of pdfUrls.slice(0, 3)) {
    const pdfFilename = pdfUrl.split('/').pop() || pdfUrl
    const pdfId = pdfFilename.replace(/\.pdf$/i, '')

    try {
      console.log(`[mashcal-pdf] Downloading: ${pdfFilename}`)
      const pdfRes = await fetch(pdfUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(30000),
      })
      if (!pdfRes.ok) {
        console.warn(`[mashcal-pdf] PDF download failed: ${pdfRes.status} for ${pdfFilename}`)
        continue
      }

      const buffer = Buffer.from(await pdfRes.arrayBuffer())
      console.log(`[mashcal-pdf] PDF buffer size: ${buffer.length}`)

      const pdfParse = (await import('pdf-parse')).default
      const parsed = await pdfParse(buffer)
      const text = parsed.text
      console.log(`[mashcal-pdf] PDF text length: ${text.length}, sample: ${text.substring(0, 200)}`)

      const lines = text.split('\n').map((l: string) => l.trim()).filter(Boolean)
      console.log(`[mashcal-pdf] Total lines: ${lines.length}`)

      const today = new Date().toISOString().split('T')[0]
      let foundInPdf = 0

      // Parse each line looking for tender data
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]

        // Skip job postings
        if (isJobPosting(line)) continue

        // Skip very short or very long lines (headers, footers)
        if (line.length < 10 || line.length > 500) continue

        // Look for lines with dates (potential tender rows)
        const allDates = [...line.matchAll(/(\d{1,2}[./]\d{1,2}[./]\d{2,4})/g)]
        if (allDates.length === 0) continue

        // Get the last date as deadline (Hebrew RTL: deadline is usually rightmost/last)
        const deadlineStr = parseDate(allDates[allDates.length - 1][1])
        if (!deadlineStr) continue

        // Skip past deadlines
        if (deadlineStr < today) continue

        // Get publish date if there are multiple dates
        const publishDateStr = allDates.length > 1 ? parseDate(allDates[0][1]) : undefined

        // Try to extract tender ID: XX/XXXX pattern or standalone number
        const idMatch = line.match(/(\d{1,4}\/\d{4})/) || line.match(/(\d{4,8})/)
        const tenderId = idMatch?.[1] || `${pdfId}-L${i}`

        // Extract title: remove dates, numbers, and take the meaningful text
        let title = line
          .replace(/\d{1,2}[./]\d{1,2}[./]\d{2,4}/g, '')  // remove dates
          .replace(/\d{1,4}\/\d{4}/g, '')  // remove ID patterns
          .replace(/₪[\d,.]+/g, '')  // remove prices
          .replace(/\s{2,}/g, ' ')
          .trim()

        // If title is too short, try combining with adjacent lines
        if (title.length < 5) {
          const prevLine = lines[i - 1] || ''
          const nextLine = lines[i + 1] || ''
          title = [prevLine, title, nextLine]
            .filter(l => l.length > 3 && l.length < 200 && !l.match(/^\d+$/))
            .join(' - ')
            .trim()
        }

        if (!title || title.length < 3) title = `מכרז ${tenderId}`

        // Publisher: look in previous lines for an authority name
        let publisher: string | undefined
        for (let j = Math.max(0, i - 3); j < i; j++) {
          const prev = lines[j]
          // Authority names are usually short lines without dates
          if (prev.length > 5 && prev.length < 80 && !prev.match(/\d{1,2}[./]\d{1,2}/) && !isJobPosting(prev)) {
            publisher = prev
            break
          }
        }

        tenders.push({
          external_id: `mashcal-${tenderId}`,
          title,
          publisher,
          deadline: deadlineStr,
          publish_date: publishDateStr,
          url: `${pdfUrl}#tender-${tenderId}`,
          category: 'רשויות מקומיות',
          raw_data: { pdf_url: pdfUrl, pdf_file: pdfFilename, line_index: i, raw_line: line },
        })
        foundInPdf++
      }

      console.log(`[mashcal-pdf] Extracted ${foundInPdf} tenders from ${pdfFilename}`)
    } catch (err: any) {
      console.warn(`[mashcal-pdf] Error processing ${pdfFilename}:`, err?.message)
    }
  }

  console.log(`[mashcal-pdf] Total extracted: ${tenders.length} tenders`)
  return tenders
}
