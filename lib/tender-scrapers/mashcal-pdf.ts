import type { TenderPoolItem } from './types'

const LIST_URL = 'https://www.mashcal.co.il/published-tenders/'
const JOB_KEYWORDS = ['דרוש/ה', 'דרוש ', 'דרושים', 'דרושה', 'משרה', 'עו"ס', 'כוח אדם', 'גיוס']
const PROCUREMENT_KEYWORDS = ['שירותים', 'רכש', 'אספקה', 'עבודות', 'הפעלה', 'ייעוץ', 'ביצוע', 'השכרה', 'מתן', 'שיקום', 'אחזקה']

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Upgrade-Insecure-Requests': '1',
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

// ── xAI fallback: ask Grok to find the PDF URLs ────────────────────────────
async function getMashcalPdfUrlsViaXai(log: (msg: string) => void): Promise<{ url: string; pubNum: number; year: number }[]> {
  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) {
    log('[mashcal] XAI_API_KEY not set, cannot use xAI fallback')
    return []
  }

  log('[mashcal] Using xAI web_search fallback to find PDF URLs...')

  const prompt = `בקר בדף https://www.mashcal.co.il/published-tenders/ וחפש קישורים ל-PDF של meshek (משק) מ-2026.
המבנה של כל קישור: https://www.mashcal.co.il/media/XXXX/meshek-NN-2026.pdf
מצא את 3 הקישורים האחרונים (עם המספר הגבוה ביותר של NN).
החזר JSON בלבד: {"pdfs": ["url1", "url2", "url3"]}`

  try {
    const res = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'grok-4-fast-non-reasoning',
        input: prompt,
        tools: [{ type: 'web_search' }],
      }),
      signal: AbortSignal.timeout(60000),
    })

    if (!res.ok) {
      log(`[mashcal] xAI fallback HTTP error: ${res.status}`)
      return []
    }

    const data = await res.json()
    const text = data.output
      ?.filter((b: any) => b.type === 'message')
      .flatMap((b: any) => b.content)
      .filter((c: any) => c.type === 'output_text')
      .map((c: any) => c.text)
      .join('') || ''

    log(`[mashcal] xAI response length: ${text.length}`)
    log(`[mashcal] xAI response: ${text.substring(0, 500)}`)

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      log('[mashcal] xAI: no JSON found in response')
      return []
    }

    const parsed = JSON.parse(jsonMatch[0])
    const urls: string[] = parsed.pdfs || []
    log(`[mashcal] xAI returned ${urls.length} PDF URLs`)

    return urls
      .filter(u => u.includes('meshek') && u.endsWith('.pdf'))
      .map(u => {
        const numMatch = u.match(/meshek-(\d+)-(\d+)/)
        return {
          url: u,
          pubNum: parseInt(numMatch?.[1] || '0'),
          year: parseInt(numMatch?.[2] || '2026'),
        }
      })
      .sort((a, b) => b.year - a.year || b.pubNum - a.pubNum)
      .slice(0, 3)
  } catch (err: any) {
    log(`[mashcal] xAI fallback error: ${err?.message}`)
    return []
  }
}

// ── Process PDF files and extract tenders ───────────────────────────────────
async function processPdfs(
  pdfs: { url: string; pubNum: number; year: number }[],
  log: (msg: string) => void
): Promise<TenderPoolItem[]> {
  const tenders: TenderPoolItem[] = []
  const today = new Date().toISOString().split('T')[0]

  for (const pdf of pdfs) {
    try {
      log(`[mashcal] Downloading meshek-${pdf.pubNum}-${pdf.year}...`)
      const pdfRes = await fetch(pdf.url, {
        headers: {
          ...BROWSER_HEADERS,
          'Accept': 'application/pdf,*/*;q=0.8',
          'Sec-Fetch-Dest': 'document',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(30000),
      })
      log(`[mashcal] PDF ${pdf.pubNum} status: ${pdfRes.status} ${pdfRes.statusText}`)
      if (!pdfRes.ok) {
        log(`[mashcal] PDF ${pdf.pubNum} download failed, trying without headers...`)
        // Retry with minimal headers
        const retryRes = await fetch(pdf.url, { signal: AbortSignal.timeout(30000) })
        if (!retryRes.ok) {
          log(`[mashcal] PDF ${pdf.pubNum} retry also failed: ${retryRes.status}`)
          continue
        }
        const buffer = Buffer.from(await retryRes.arrayBuffer())
        log(`[mashcal] PDF ${pdf.pubNum} retry buffer: ${buffer.length} bytes`)
        await parsePdfBuffer(buffer, pdf, tenders, today, log)
        continue
      }

      const buffer = Buffer.from(await pdfRes.arrayBuffer())
      log(`[mashcal] PDF ${pdf.pubNum} buffer: ${buffer.length} bytes`)

      await parsePdfBuffer(buffer, pdf, tenders, today, log)
    } catch (err: any) {
      log(`[mashcal] PDF ${pdf.pubNum} ERROR: ${err?.message}${err?.cause?.message ? ` cause: ${err.cause.message}` : ''}`)
    }
  }

  return tenders
}

// ── Parse a PDF buffer into tender items ────────────────────────────────────
async function parsePdfBuffer(
  buffer: Buffer,
  pdf: { url: string; pubNum: number; year: number },
  tenders: TenderPoolItem[],
  today: string,
  log: (msg: string) => void
) {
  const pdfParse = (await import('pdf-parse')).default
  const parsed = await pdfParse(buffer)
  const text = parsed.text
  log(`[mashcal] PDF ${pdf.pubNum} text: ${text.length} chars`)
  log(`[mashcal] PDF ${pdf.pubNum} sample: ${text.substring(0, 500).replace(/\n/g, '\\n')}`)

  const lines = text.split('\n').map((l: string) => l.trim()).filter(Boolean)
  log(`[mashcal] PDF ${pdf.pubNum} lines: ${lines.length}`)

  let foundInPdf = 0
  let skippedJob = 0
  let skippedNoProcurement = 0
  let skippedPastDeadline = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.length < 8) continue
    if (isJobPosting(line)) { skippedJob++; continue }

    const dateMatches = [...line.matchAll(/(\d{1,2}[./]\d{1,2}[./]\d{2,4})/g)]
    if (dateMatches.length === 0) continue

    const deadlineStr = parseDate(dateMatches[dateMatches.length - 1][1])
    if (!deadlineStr) continue
    if (deadlineStr < today) { skippedPastDeadline++; continue }

    const contextBlock = [lines[i - 1] || '', line, lines[i + 1] || ''].join(' ')
    if (!isProcurement(contextBlock)) { skippedNoProcurement++; continue }

    const tenderNumMatch = line.match(/(\d{1,4}[/\-]\d{2,4})/)
    const tenderNum = tenderNumMatch?.[1] || `L${i}`

    let publisher: string | undefined
    if (tenderNumMatch) {
      const beforeNum = line.substring(0, tenderNumMatch.index).trim()
      if (beforeNum.length > 3 && beforeNum.length < 80) publisher = beforeNum
    }
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

    let title = line
      .replace(/\d{1,2}[./]\d{1,2}[./]\d{2,4}/g, '')
      .replace(/\d{1,4}[/\-]\d{2,4}/g, '')
      .replace(/₪[\d,. ]+/g, '')
      .replace(/\d{2,3}-\d{7}/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()

    if (title.length < 5 && i + 1 < lines.length) {
      const nextLine = lines[i + 1]
      if (nextLine.length > 5 && nextLine.length < 200 && !nextLine.match(/^\d+$/)) {
        title = `${title} ${nextLine}`.trim()
      }
    }

    if (!title || title.length < 3) title = `מכרז ${tenderNum}`
    if (publisher && title.startsWith(publisher)) title = title.substring(publisher.length).trim()

    const budgetMatch = line.match(/₪([\d,. ]+)/) || line.match(/([\d,]+)\s*₪/)
    const budget = budgetMatch ? `₪${budgetMatch[1].trim()}` : undefined
    const publishDateStr = dateMatches.length > 1 ? parseDate(dateMatches[0][1]) : undefined

    tenders.push({
      external_id: `mashcal-${pdf.pubNum}-${tenderNum}`,
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
}

// ── Main entry point ────────────────────────────────────────────────────────
export async function scrapeMashcalPdfs(): Promise<TenderPoolItem[]> {
  const logs: string[] = []
  const log = (msg: string) => { console.log(msg); logs.push(msg) }

  let pdfs: { url: string; pubNum: number; year: number }[] = []

  // ── Try 1: Direct fetch of list page ──────────────────────────────────
  try {
    log('[mashcal] Attempting direct fetch of list page...')
    const res = await fetch(LIST_URL, {
      headers: BROWSER_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    })
    log(`[mashcal] list page status: ${res.status} ${res.statusText}`)

    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)

    const html = await res.text()
    log(`[mashcal] list page size: ${html.length}`)

    // Match PDFs
    const pdfRegex = /href="(https?:\/\/www\.mashcal\.co\.il\/media\/[^"]+\/meshek-(\d+)-(\d+)\.pdf)"/gi
    const matches = [...html.matchAll(pdfRegex)]
    log(`[mashcal] PDF regex matches: ${matches.length}`)

    if (matches.length === 0) {
      // Fallback regex
      const fallbackRegex = /href="([^"]*meshek[^"]*\.pdf)"/gi
      const fallbackMatches = [...html.matchAll(fallbackRegex)]
      log(`[mashcal] Fallback PDF matches: ${fallbackMatches.length}`)

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
        if (numMatch) {
          pdfs.push({ url, pubNum: parseInt(numMatch[1]), year: parseInt(numMatch[2]) })
        }
      }
    } else {
      pdfs = matches.map(m => ({ url: m[1], pubNum: parseInt(m[2]), year: parseInt(m[3]) }))
    }
  } catch (err: any) {
    log(`[mashcal] Direct fetch FAILED: ${err?.message}${err?.cause?.message ? ` | cause: ${err.cause.message}` : ''}${err?.code ? ` | code: ${err.code}` : ''}`)
  }

  // ── Try 2: xAI fallback if direct fetch failed ────────────────────────
  if (pdfs.length === 0) {
    log('[mashcal] No PDFs from direct fetch, trying xAI fallback...')
    pdfs = await getMashcalPdfUrlsViaXai(log)
  }

  // Sort and limit
  pdfs = pdfs
    .sort((a, b) => b.year - a.year || b.pubNum - a.pubNum)
    .slice(0, 3)

  log(`[mashcal] Processing ${pdfs.length} PDFs: ${pdfs.map(p => `meshek-${p.pubNum}-${p.year}`).join(', ')}`)

  if (pdfs.length === 0) {
    log('[mashcal] No PDFs found from any method, aborting')
    const result: TenderPoolItem[] = []
    // Return a dummy item with logs so they're visible in UI
    result.push({
      external_id: 'mashcal-debug-log',
      title: '[DEBUG] Mashcal scraper logs — no tenders found',
      category: 'רשויות מקומיות',
      raw_data: { _logs: logs, _debug: true },
    })
    return result
  }

  // ── Process PDFs ──────────────────────────────────────────────────────
  const tenders = await processPdfs(pdfs, log)

  log(`[mashcal] TOTAL: ${tenders.length} tenders from ${pdfs.length} PDFs`)

  // Attach logs to first tender
  if (tenders.length > 0) {
    tenders[0].raw_data = { ...tenders[0].raw_data, _logs: logs }
  }

  return tenders
}
