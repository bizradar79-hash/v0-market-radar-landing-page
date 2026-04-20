// mashcal-pdf.ts — Manual PDF upload only
// Auto-scan disabled: mashcal.co.il blocks all Vercel IPs and public proxies.
// Use the admin "העלה PDF" button to upload PDFs manually.

// Use subpath import to avoid pdf-parse@1.1.1 test-file ENOENT bug
import pdfParse from 'pdf-parse/lib/pdf-parse.js'
import type { TenderPoolItem } from './types'

const JOB_KEYWORDS = ['דרוש/ה', 'דרוש ', 'דרושים', 'דרושה', 'משרה', 'עו"ס', 'כוח אדם', 'גיוס']
const PROCUREMENT_KEYWORDS = ['שירותים', 'רכש', 'אספקה', 'עבודות', 'הפעלה', 'ייעוץ', 'ביצוע', 'השכרה', 'מתן', 'שיקום', 'אחזקה']

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

// ── Auto-scan stub (disabled) ───────────────────────────────────────────────
export async function scrapeMashcalPdfs(): Promise<TenderPoolItem[]> {
  console.log('[mashcal] Auto-scan disabled — mashcal.co.il blocks Vercel IPs. Use manual PDF upload.')
  return []
}
