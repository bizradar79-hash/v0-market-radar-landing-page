import type { TenderPoolItem } from './types'

const LIST_URL = 'https://www.mashcal.co.il/published-tenders/'
const JOB_KEYWORDS = ['דרוש/ה', 'דרוש ', 'דרושים', 'דרושה', 'משרה', 'עו"ס', 'כוח אדם', 'גיוס']
const PROCUREMENT_KEYWORDS = ['שירותים', 'רכש', 'אספקה', 'עבודות', 'הפעלה', 'ייעוץ', 'ביצוע', 'השכרה', 'מתן', 'שיקום', 'אחזקה']

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8',
}

function parseDate(text: string): string | undefined {
  const match = text.match(/(\d{1,2})[./](\d{1,2})[./](\d{2,4})/)
  if (!match) return undefined
  let [, d, m, y] = match
  if (y.length === 2) y = '20' + y
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function isJobPosting(text: string): boolean {
  return JOB_KEYWORDS.some(kw => text.includes(kw))
}

function isProcurement(text: string): boolean {
  return PROCUREMENT_KEYWORDS.some(kw => text.includes(kw))
}

export async function scrapeMashcalPdfs(): Promise<TenderPoolItem[]> {
  const logs: string[] = []
  const log = (msg: string) => { console.log(msg); logs.push(msg) }

  const tenders: TenderPoolItem[] = []
  const today = new Date().toISOString().split('T')[0]

  // ── Step 1: Fetch list page and extract PDF URLs ───────────────────────
  let html: string
  try {
    const res = await fetch(LIST_URL, {
      headers: HEADERS,
      signal: AbortSignal.timeout(15000),
    })
    log(`[mashcal] list page status: ${res.status}`)
    if (!res.ok) return tenders
    html = await res.text()
    log(`[mashcal] list page size: ${html.length}`)
  } catch (err: any) {
    log(`[mashcal] list page FAILED: ${err?.message}`)
    return tenders
  }

  // Match PDFs: href="https://www.mashcal.co.il/media/.../meshek-NN-YYYY.pdf"
  const pdfRegex = /href="(https?:\/\/www\.mashcal\.co\.il\/media\/[^"]+\/meshek-(\d+)-(\d+)\.pdf)"/gi
  const matches = [...html.matchAll(pdfRegex)]
  log(`[mashcal] PDF regex matches: ${matches.length}`)

  if (matches.length === 0) {
    // Fallback: try any PDF link
    const fallbackRegex = /href="([^"]*meshek[^"]*\.pdf)"/gi
    const fallbackMatches = [...html.matchAll(fallbackRegex)]
    log(`[mashcal] Fallback PDF matches: ${fallbackMatches.length}`)

    // Also log a snippet of the HTML around "meshek" or "pdf" for debugging
    const meshekIdx = html.indexOf('meshek')
    if (meshekIdx > -1) {
      log(`[mashcal] HTML near "meshek": ${html.substring(Math.max(0, meshekIdx - 100), meshekIdx + 200)}`)
    }
    const pdfIdx = html.indexOf('.pdf')
    if (pdfIdx > -1) {
      log(`[mashcal] HTML near ".pdf": ${html.substring(Math.max(0, pdfIdx - 100), pdfIdx + 100)}`)
    }

    for (const m of fallbackMatches) {
      let url = m[1]
      if (!url.startsWith('http')) url = new URL(url, LIST_URL).href
      const numMatch = url.match(/meshek-(\d+)-(\d+)/)
      matches.push([m[0], url, numMatch?.[1] || '0', numMatch?.[2] || '2026'] as unknown as RegExpExecArray)
    }
  }

  // Sort by year desc then pub number desc, take top 3
  const pdfs = matches
    .map(m => ({ url: m[1], pubNum: parseInt(m[2]), year: parseInt(m[3]) }))
    .sort((a, b) => b.year - a.year || b.pubNum - a.pubNum)
    .slice(0, 3)

  log(`[mashcal] Processing ${pdfs.length} PDFs: ${pdfs.map(p => `meshek-${p.pubNum}-${p.year}`).join(', ')}`)

  if (pdfs.length === 0) {
    log('[mashcal] No PDFs found, aborting')
    return tenders
  }

  // ── Step 2: Download and parse each PDF ────────────────────────────────
  for (const pdf of pdfs) {
    try {
      log(`[mashcal] Downloading meshek-${pdf.pubNum}-${pdf.year}...`)
      const pdfRes = await fetch(pdf.url, {
        headers: { ...HEADERS, 'Accept': 'application/pdf' },
        signal: AbortSignal.timeout(30000),
      })
      log(`[mashcal] PDF ${pdf.pubNum} status: ${pdfRes.status}`)
      if (!pdfRes.ok) continue

      const buffer = Buffer.from(await pdfRes.arrayBuffer())
      log(`[mashcal] PDF ${pdf.pubNum} buffer: ${buffer.length} bytes`)

      const pdfParse = (await import('pdf-parse')).default
      const parsed = await pdfParse(buffer)
      const text = parsed.text
      log(`[mashcal] PDF ${pdf.pubNum} text: ${text.length} chars`)
      log(`[mashcal] PDF ${pdf.pubNum} sample: ${text.substring(0, 500).replace(/\n/g, '\\n')}`)

      // ── Step 3: Parse tender rows ────────────────────────────────────
      const lines = text.split('\n').map((l: string) => l.trim()).filter(Boolean)
      log(`[mashcal] PDF ${pdf.pubNum} lines: ${lines.length}`)

      let foundInPdf = 0
      let skippedJob = 0
      let skippedNoProcurement = 0
      let skippedPastDeadline = 0

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]

        // Skip very short lines (page numbers, headers)
        if (line.length < 8) continue

        // Skip job postings
        if (isJobPosting(line)) { skippedJob++; continue }

        // Find dates in line
        const dateMatches = [...line.matchAll(/(\d{1,2}[./]\d{1,2}[./]\d{2,4})/g)]
        if (dateMatches.length === 0) continue

        // The last date is usually the deadline
        const deadlineStr = parseDate(dateMatches[dateMatches.length - 1][1])
        if (!deadlineStr) continue

        // Skip past deadlines
        if (deadlineStr < today) { skippedPastDeadline++; continue }

        // Check procurement keywords in this line + adjacent lines
        const contextBlock = [
          lines[i - 1] || '',
          line,
          lines[i + 1] || '',
        ].join(' ')

        if (!isProcurement(contextBlock)) { skippedNoProcurement++; continue }

        // Extract tender number: XX/YYYY or XX/YY or XX-YYYY
        const tenderNumMatch = line.match(/(\d{1,4}[/\-]\d{2,4})/)
        const tenderNum = tenderNumMatch?.[1] || `L${i}`

        // Extract authority/publisher from beginning of line or previous lines
        let publisher: string | undefined
        // In RTL PDF text, the authority name often appears before the tender number
        if (tenderNumMatch) {
          const beforeNum = line.substring(0, tenderNumMatch.index).trim()
          if (beforeNum.length > 3 && beforeNum.length < 80) {
            publisher = beforeNum
          }
        }
        // Fallback: look at previous lines for authority names
        if (!publisher) {
          for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
            const prev = lines[j]
            if (prev.length > 3 && prev.length < 80 &&
                !prev.match(/\d{1,2}[./]\d{1,2}/) &&
                !prev.match(/^\d+$/) &&
                !isJobPosting(prev)) {
              publisher = prev
              break
            }
          }
        }

        // Extract title: the main descriptive text
        let title = line
          .replace(/\d{1,2}[./]\d{1,2}[./]\d{2,4}/g, '')   // remove dates
          .replace(/\d{1,4}[/\-]\d{2,4}/g, '')              // remove tender numbers
          .replace(/₪[\d,. ]+/g, '')                         // remove prices
          .replace(/\d{2,3}-\d{7}/g, '')                     // remove phone numbers
          .replace(/\s{2,}/g, ' ')
          .trim()

        // If title too short, combine with next line
        if (title.length < 5 && i + 1 < lines.length) {
          const nextLine = lines[i + 1]
          if (nextLine.length > 5 && nextLine.length < 200 && !nextLine.match(/^\d+$/)) {
            title = `${title} ${nextLine}`.trim()
          }
        }

        if (!title || title.length < 3) title = `מכרז ${tenderNum}`

        // Remove publisher from title if it appears there
        if (publisher && title.startsWith(publisher)) {
          title = title.substring(publisher.length).trim()
        }

        // Extract budget if present
        const budgetMatch = line.match(/₪([\d,. ]+)/) || line.match(/([\d,]+)\s*₪/)
        const budget = budgetMatch ? `₪${budgetMatch[1].trim()}` : undefined

        // Publish date (first date if multiple)
        const publishDateStr = dateMatches.length > 1 ? parseDate(dateMatches[0][1]) : undefined

        const externalId = `mashcal-${pdf.pubNum}-${tenderNum}`

        tenders.push({
          external_id: externalId,
          title,
          publisher,
          category: 'רשויות מקומיות',
          publish_date: publishDateStr,
          deadline: deadlineStr,
          url: pdf.url,
          budget,
          raw_data: {
            pdf_url: pdf.url,
            pub_number: pdf.pubNum,
            year: pdf.year,
            line_index: i,
            full_line: line,
          },
        })
        foundInPdf++
      }

      log(`[mashcal] PDF ${pdf.pubNum}: found=${foundInPdf} skippedJob=${skippedJob} skippedNoProcurement=${skippedNoProcurement} skippedPast=${skippedPastDeadline}`)
    } catch (err: any) {
      log(`[mashcal] PDF ${pdf.pubNum} ERROR: ${err?.message}`)
    }
  }

  log(`[mashcal] TOTAL: ${tenders.length} tenders from ${pdfs.length} PDFs`)

  // Attach logs to raw_data of first tender for debugging visibility
  if (tenders.length > 0) {
    tenders[0].raw_data = { ...tenders[0].raw_data, _logs: logs }
  }

  return tenders
}

// Export for log capture
export { }
