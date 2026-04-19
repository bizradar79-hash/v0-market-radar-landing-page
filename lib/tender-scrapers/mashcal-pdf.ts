import type { TenderPoolItem } from './types'

const LIST_URL = 'https://www.mashcal.co.il/published-tenders/'
const PROCUREMENT_KEYWORDS = ['שירותים', 'רכש', 'עבודות', 'אספקה', 'שיפוץ', 'הפעלה', 'ייעוץ']
const JOB_KEYWORDS = ['דרוש/ה', 'דרושה', 'דרוש', 'משרה']

function parseDeadline(text: string): string | undefined {
  const match = text.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/)
  if (match) {
    const [, d, m, y] = match
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return undefined
}

function isJobPosting(text: string): boolean {
  const lower = text.toLowerCase()
  return JOB_KEYWORDS.some(kw => lower.includes(kw))
}

function isProcurement(text: string): boolean {
  return PROCUREMENT_KEYWORDS.some(kw => text.includes(kw))
}

export async function scrapeMashcalPdfs(existingExternalIds: Set<string>): Promise<TenderPoolItem[]> {
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
  } catch (err: any) {
    console.warn('[mashcal-pdf] Failed to fetch list page:', err?.message)
    return []
  }

  // Step 2: Extract PDF links matching /meshek-\d+-2026\.pdf/
  const pdfRegex = /href="([^"]*meshek-\d+-2026\.pdf[^"]*)"/gi
  const pdfUrls: string[] = []
  let match
  while ((match = pdfRegex.exec(html)) !== null) {
    let pdfUrl = match[1]
    if (!pdfUrl.startsWith('http')) {
      pdfUrl = new URL(pdfUrl, LIST_URL).href
    }
    pdfUrls.push(pdfUrl)
  }

  console.log(`[mashcal-pdf] Found ${pdfUrls.length} PDF links for 2026`)

  // Step 3: Process each PDF (limit to 5 most recent)
  for (const pdfUrl of pdfUrls.slice(0, 5)) {
    const pdfId = pdfUrl.match(/meshek-(\d+-\d+)/)?.[1] || pdfUrl
    if (existingExternalIds.has(`mashcal-${pdfId}`)) {
      console.log(`[mashcal-pdf] Skipping already processed: ${pdfId}`)
      continue
    }

    try {
      const pdfRes = await fetch(pdfUrl, {
        signal: AbortSignal.timeout(30000),
      })
      if (!pdfRes.ok) continue

      const buffer = Buffer.from(await pdfRes.arrayBuffer())
      const pdfParse = (await import('pdf-parse')).default
      const parsed = await pdfParse(buffer)
      const lines = parsed.text.split('\n').map((l: string) => l.trim()).filter(Boolean)

      // Parse tender rows from PDF text
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]

        // Skip job postings
        if (isJobPosting(line)) continue

        // Look for tender-like lines with a deadline date
        const deadlineStr = parseDeadline(line)
        if (!deadlineStr) continue

        // Skip past deadlines
        if (deadlineStr < new Date().toISOString().split('T')[0]) continue

        // Check if this is procurement-related
        const contextBlock = lines.slice(Math.max(0, i - 2), i + 3).join(' ')
        if (!isProcurement(contextBlock)) continue

        // Try to extract tender ID from nearby lines
        const idMatch = contextBlock.match(/(\d{2,}\/\d{4}|\d{4,})/)
        const tenderId = idMatch?.[1] || `${pdfId}-line${i}`

        // Extract publisher (usually the authority name)
        const publisherLine = lines[i - 1] || lines[i - 2] || ''
        const publisher = publisherLine.length > 3 && publisherLine.length < 100 ? publisherLine : undefined

        // Title is the main text of the line (without the date)
        const title = line.replace(/\d{1,2}[./]\d{1,2}[./]\d{4}/g, '').trim() || `מכרז ${tenderId}`

        tenders.push({
          external_id: `mashcal-${tenderId}`,
          title,
          publisher,
          deadline: deadlineStr,
          url: `${pdfUrl}#tender-${tenderId}`,
          category: 'רשויות מקומיות',
          raw_data: { pdf_url: pdfUrl, line_index: i, raw_line: line },
        })
      }
    } catch (err: any) {
      console.warn(`[mashcal-pdf] Error processing ${pdfUrl}:`, err?.message)
    }
  }

  console.log(`[mashcal-pdf] Extracted ${tenders.length} tenders`)
  return tenders
}
