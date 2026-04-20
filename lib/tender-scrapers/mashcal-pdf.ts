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

// ── Shared: parse a Mashcal PDF buffer into tender items ────────────────────
// Exported so upload-pdf route can reuse it
export async function parseMashcalPdfBuffer(
  buffer: Buffer,
  pubNum: number,
  year: number,
  pdfUrl?: string,
): Promise<{ tenders: TenderPoolItem[]; logs: string[] }> {
  const logs: string[] = []
  const log = (msg: string) => logs.push(msg)
  const tenders: TenderPoolItem[] = []
  const today = new Date().toISOString().split('T')[0]

  const pdfParse = (await import('pdf-parse')).default
  const parsed = await pdfParse(buffer)
  const text = parsed.text
  log(`[mashcal] PDF ${pubNum} text: ${text.length} chars`)
  log(`[mashcal] PDF ${pubNum} sample: ${text.substring(0, 500).replace(/\n/g, '\\n')}`)

  const lines = text.split('\n').map((l: string) => l.trim()).filter(Boolean)
  log(`[mashcal] PDF ${pubNum} lines: ${lines.length}`)

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
      external_id: `mashcal-${pubNum}-${tenderNum}`,
      title,
      publisher,
      category: 'רשויות מקומיות',
      publish_date: publishDateStr,
      deadline: deadlineStr,
      url: pdfUrl || `meshek-${pubNum}-${year}.pdf`,
      budget,
      raw_data: {
        pdf_url: pdfUrl,
        pub_number: pubNum,
        year,
        line_index: i,
        full_line: line,
      },
    })
    foundInPdf++
  }

  log(`[mashcal] PDF ${pubNum}: found=${foundInPdf} skippedJob=${skippedJob} skippedNoProcurement=${skippedNoProcurement} skippedPast=${skippedPastDeadline}`)
  return { tenders, logs }
}

// ── Proxy fetch helper ──────────────────────────────────────────────────────
async function fetchViaProxy(url: string, log: (msg: string) => void): Promise<Response> {
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
  log(`[mashcal] Trying proxy: ${proxyUrl.substring(0, 80)}...`)
  const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(30000) })
  log(`[mashcal] Proxy status: ${res.status}`)
  return res
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
      log(`[mashcal] xAI HTTP error: ${res.status}`)
      return []
    }
    const data = await res.json()
    const text = data.output
      ?.filter((b: any) => b.type === 'message')
      .flatMap((b: any) => b.content)
      .filter((c: any) => c.type === 'output_text')
      .map((c: any) => c.text)
      .join('') || ''

    log(`[mashcal] xAI response: ${text.substring(0, 300)}`)

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) { log('[mashcal] xAI: no JSON'); return [] }

    const urls: string[] = JSON.parse(jsonMatch[0]).pdfs || []
    log(`[mashcal] xAI returned ${urls.length} URLs`)

    return urls
      .filter(u => u.includes('meshek') && u.endsWith('.pdf'))
      .map(u => {
        const m = u.match(/meshek-(\d+)-(\d+)/)
        return { url: u, pubNum: parseInt(m?.[1] || '0'), year: parseInt(m?.[2] || '2026') }
      })
      .sort((a, b) => b.year - a.year || b.pubNum - a.pubNum)
      .slice(0, 3)
  } catch (err: any) {
    log(`[mashcal] xAI error: ${err?.message}`)
    return []
  }
}

// ── Download a single PDF with fallbacks ────────────────────────────────────
async function downloadPdf(
  url: string,
  log: (msg: string) => void
): Promise<Buffer | null> {
  // Try 1: Direct fetch with browser headers
  try {
    const res = await fetch(url, {
      headers: { ...BROWSER_HEADERS, 'Accept': 'application/pdf,*/*;q=0.8' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    })
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer())
      log(`[mashcal] Direct download OK: ${buf.length} bytes`)
      return buf
    }
    log(`[mashcal] Direct download failed: ${res.status}`)
  } catch (err: any) {
    log(`[mashcal] Direct download error: ${err?.message}`)
  }

  // Try 2: Minimal headers
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer())
      log(`[mashcal] Minimal download OK: ${buf.length} bytes`)
      return buf
    }
    log(`[mashcal] Minimal download failed: ${res.status}`)
  } catch (err: any) {
    log(`[mashcal] Minimal download error: ${err?.message}`)
  }

  // Try 3: Proxy
  try {
    const res = await fetchViaProxy(url, log)
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer())
      log(`[mashcal] Proxy download OK: ${buf.length} bytes`)
      return buf
    }
    log(`[mashcal] Proxy download failed: ${res.status}`)
  } catch (err: any) {
    log(`[mashcal] Proxy download error: ${err?.message}`)
  }

  return null
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
    log(`[mashcal] list page: ${res.status} ${res.statusText}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()
    log(`[mashcal] list page size: ${html.length}`)
    pdfs = extractPdfUrls(html, log)
  } catch (err: any) {
    log(`[mashcal] Direct fetch FAILED: ${err?.message}${err?.cause?.message ? ` | cause: ${err.cause.message}` : ''}`)
  }

  // ── Try 2: Proxy fetch of list page ───────────────────────────────────
  if (pdfs.length === 0) {
    try {
      log('[mashcal] Trying proxy for list page...')
      const res = await fetchViaProxy(LIST_URL, log)
      if (res.ok) {
        const html = await res.text()
        log(`[mashcal] Proxy list page size: ${html.length}`)
        pdfs = extractPdfUrls(html, log)
      }
    } catch (err: any) {
      log(`[mashcal] Proxy list page FAILED: ${err?.message}`)
    }
  }

  // ── Try 3: xAI fallback ──────────────────────────────────────────────
  if (pdfs.length === 0) {
    log('[mashcal] No PDFs from fetch, trying xAI...')
    pdfs = await getMashcalPdfUrlsViaXai(log)
  }

  pdfs = pdfs.sort((a, b) => b.year - a.year || b.pubNum - a.pubNum).slice(0, 3)
  log(`[mashcal] Processing ${pdfs.length} PDFs: ${pdfs.map(p => `meshek-${p.pubNum}-${p.year}`).join(', ')}`)

  if (pdfs.length === 0) {
    log('[mashcal] No PDFs found, aborting. Use manual upload instead.')
    return [{
      external_id: 'mashcal-debug-log',
      title: '[DEBUG] Mashcal — no PDFs found. Use "העלה PDF" to upload manually.',
      category: 'רשויות מקומיות',
      raw_data: { _logs: logs, _debug: true },
    }]
  }

  // ── Download and parse PDFs ───────────────────────────────────────────
  const tenders: TenderPoolItem[] = []
  for (const pdf of pdfs) {
    log(`[mashcal] Downloading meshek-${pdf.pubNum}-${pdf.year}...`)
    const buffer = await downloadPdf(pdf.url, log)
    if (!buffer) {
      log(`[mashcal] PDF ${pdf.pubNum} — all download methods failed`)
      continue
    }

    const result = await parseMashcalPdfBuffer(buffer, pdf.pubNum, pdf.year, pdf.url)
    result.logs.forEach(l => log(l))
    tenders.push(...result.tenders)
  }

  log(`[mashcal] TOTAL: ${tenders.length} tenders from ${pdfs.length} PDFs`)

  if (tenders.length > 0) {
    tenders[0].raw_data = { ...tenders[0].raw_data, _logs: logs }
  }
  return tenders
}

// ── Extract PDF URLs from HTML ──────────────────────────────────────────────
function extractPdfUrls(html: string, log: (msg: string) => void): { url: string; pubNum: number; year: number }[] {
  const pdfRegex = /href="(https?:\/\/www\.mashcal\.co\.il\/media\/[^"]+\/meshek-(\d+)-(\d+)\.pdf)"/gi
  const matches = [...html.matchAll(pdfRegex)]
  log(`[mashcal] PDF regex matches: ${matches.length}`)

  if (matches.length > 0) {
    return matches.map(m => ({ url: m[1], pubNum: parseInt(m[2]), year: parseInt(m[3]) }))
  }

  // Fallback
  const fallback = [...html.matchAll(/href="([^"]*meshek[^"]*\.pdf)"/gi)]
  log(`[mashcal] Fallback matches: ${fallback.length}`)
  return fallback
    .map(m => {
      let url = m[1]
      if (!url.startsWith('http')) url = new URL(url, LIST_URL).href
      const nm = url.match(/meshek-(\d+)-(\d+)/)
      return nm ? { url, pubNum: parseInt(nm[1]), year: parseInt(nm[2]) } : null
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
}
