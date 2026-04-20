// mashcal-pdf.ts — Manual PDF upload only
// Auto-scan disabled: mashcal.co.il blocks all Vercel IPs and public proxies.
// Parsing: pdf-parse extracts raw text, xAI structures it into tenders.
// VERSION: 2026-04-20-v2 (xAI forced, no regex fallback)

import pdfParse from 'pdf-parse/lib/pdf-parse.js'
import type { TenderPoolItem } from './types'

const JOB_KEYWORDS = ['דרוש', 'דרושים', 'משרה', 'איוש', 'מנהל/ת', 'רכז/ת', 'עובד/ת סוציאלי', 'גננ/ת', 'כח אדם']

interface ParsedTender {
  city: string
  tender_number: string
  title: string
  deadline: string | null
}

// ── Parse PDF buffer via xAI (ONLY method — no regex fallback) ──────────────
export async function parseMashcalPdfBuffer(
  buffer: Buffer,
  pubNum: number,
  year: number,
  _pdfUrl?: string,
): Promise<{ tenders: TenderPoolItem[]; logs: string[] }> {
  const logs: string[] = []
  const log = (msg: string) => { console.log(msg); logs.push(msg) }

  log('[mashcal] === parseMashcalPdfBuffer v2 (xAI) ===')
  log(`[mashcal] pubNum=${pubNum} year=${year} bufferSize=${buffer.length}`)

  // Step 1: Extract raw text
  const parsed = await pdfParse(buffer)
  const rawText = parsed.text
  log(`[mashcal] Raw text length: ${rawText.length}`)

  if (rawText.length < 50) {
    throw new Error(`[mashcal] PDF text too short (${rawText.length} chars) — is this a valid PDF?`)
  }

  // Step 2: Send to xAI for structured parsing
  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) {
    throw new Error('[mashcal] XAI_API_KEY not set — cannot parse PDF. Set env var in Vercel.')
  }

  const requestBody = {
    model: 'grok-4-fast-non-reasoning',
    input: [
      { role: 'system', content: 'You parse Hebrew municipal tender PDFs. Output strict JSON only, no markdown.' },
      {
        role: 'user', content: `Parse this PDF text from Israel's mashcal.co.il tender bulletin (publication ${pubNum}/${year}). Text is Hebrew RTL and may appear jumbled.

Each tender row contains these fields:
- city (שם הרשות המקומית)
- tender_number (מס' המכרז, like '19/26' or '1/2026')
- title (שם המכרז, full description)
- deadline (מועד להגשה, DD/MM/YYYY format)

FILTER OUT rows about jobs/employment: דרוש, דרושים, משרה, מכרז כח אדם, איוש משרה, מנהל/ת, רכז/ת, עובד/ת סוציאלי, גננ/ת — any personnel tender.

KEEP procurement/services: שירותים, רכש, אספקה, עבודות, הפעלה, ייעוץ, ביצוע, השכרה, מתן, שיקום, אחזקה, פיתוח, תחזוקה, תכנון, הקמה.

Output ONLY this JSON:
{
  "tenders": [
    {
      "city": "בית דגן",
      "tender_number": "19/26",
      "title": "מתן שירותי ניהול תקציבי פיתוח ותקצוב פרויקטים",
      "deadline": "2026-05-04"
    }
  ]
}

Keep title concise — the essential service/procurement subject.
Convert deadline to YYYY-MM-DD format. If deadline unclear, use null.

Raw PDF text:
---
${rawText.substring(0, 30000)}
---`,
      },
    ],
  }

  log(`[mashcal] xAI request body (first 500): ${JSON.stringify(requestBody).slice(0, 500)}`)

  const res = await fetch('https://api.x.ai/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(90000),
  })

  log(`[mashcal] xAI response status: ${res.status}`)

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`[mashcal] xAI HTTP ${res.status}: ${errText.substring(0, 300)}`)
  }

  const data = await res.json()
  const responseText = data.output
    ?.filter((b: any) => b.type === 'message')
    .flatMap((b: any) => b.content)
    .filter((c: any) => c.type === 'output_text')
    .map((c: any) => c.text)
    .join('') || ''

  log(`[mashcal] xAI raw response (first 2000): ${responseText.substring(0, 2000)}`)

  // Extract JSON from response
  const jsonMatch = responseText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error(`[mashcal] xAI returned no JSON. Response: ${responseText.substring(0, 500)}`)
  }

  const result = JSON.parse(jsonMatch[0])
  log(`[mashcal] xAI parsed JSON keys: ${Object.keys(result).join(', ')}`)

  const parsedTenders: ParsedTender[] = result.tenders || []
  log(`[mashcal] xAI returned ${parsedTenders.length} tenders`)

  if (parsedTenders.length === 0) {
    log('[mashcal] WARNING: xAI returned 0 tenders')
    return { tenders: [], logs }
  }

  // Step 3: Post-filter — remove any job postings xAI missed
  const filtered = parsedTenders.filter(t => {
    const combined = `${t.title} ${t.city}`
    return !JOB_KEYWORDS.some(kw => combined.includes(kw))
  })

  if (filtered.length < parsedTenders.length) {
    log(`[mashcal] Post-filter removed ${parsedTenders.length - filtered.length} job postings`)
  }

  // Step 4: Map to TenderPoolItem (3 key fields: title, publisher, deadline)
  const tenders: TenderPoolItem[] = filtered.map(t => ({
    external_id: `${pubNum}-${year}-${t.tender_number.replace(/\//g, '-')}`,
    title: `${t.title} (מכרז ${t.tender_number})`,
    publisher: t.city,
    category: 'רשויות מקומיות',
    publish_date: `${year}-${String(Math.ceil(pubNum / 2)).padStart(2, '0')}-01`,
    deadline: t.deadline || null,
    url: 'https://www.mashcal.co.il/published-tenders',
    raw_data: {
      _version: 'xai-v2',
      source: 'מכרזי משכ"ל',
      pub_number: pubNum,
      year,
      xai_parsed: t,
    },
  }))

  log(`[mashcal] Final: ${tenders.length} tenders mapped`)
  return { tenders, logs }
}

// ── Auto-scan stub (disabled) ───────────────────────────────────────────────
export async function scrapeMashcalPdfs(): Promise<TenderPoolItem[]> {
  console.log('[mashcal] Auto-scan disabled — mashcal.co.il blocks Vercel IPs. Use manual PDF upload.')
  return []
}
