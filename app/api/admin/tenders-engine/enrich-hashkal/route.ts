export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import * as cheerio from 'cheerio'

async function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return [] },
        setAll() {},
      },
    }
  )
}

async function verifyAccess(request: Request): Promise<boolean> {
  const auth = request.headers.get('authorization')
  if (auth === `Bearer ${process.env.CRON_SECRET}` && process.env.CRON_SECRET) {
    return true
  }
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false
    const sc = await createServiceClient()
    const { data: role } = await sc
      .from('user_roles').select('is_admin').eq('user_id', user.id).single()
    return role?.is_admin === true
  } catch {
    return false
  }
}

function normalizeDate(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null
  const trimmed = raw.trim()

  // "המועד האחרון להגשת השגות חלף" or similar expired text
  if (trimmed.includes('חלף') || trimmed.includes('עבר')) return null

  // DD/MM/YYYY
  const dmy = trimmed.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/)
  if (dmy) {
    const [, d, m, y] = dmy
    const month = parseInt(m)
    const day = parseInt(d)
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    const date = new Date(parseInt(y), month - 1, day)
    if (date.getMonth() !== month - 1) return null
    return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  // Already ISO
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return iso[0]

  return null
}

interface EnrichResult {
  title: string | null
  type: string | null
  publisher: string | null
  publishDate: string | null
  deadline: string | null
  description: string | null
  method: 'cheerio' | 'xai' | 'none'
}

async function enrichFromHtml(url: string): Promise<EnrichResult> {
  const result: EnrichResult = {
    title: null, type: null, publisher: null,
    publishDate: null, deadline: null, description: null,
    method: 'none',
  }

  // Phase A: cheerio
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NSRadar/1.0)',
        'Accept': 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'he-IL,he;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      console.log('[hashkal-enrich] Fetch failed:', res.status, url)
      return result
    }

    const html = await res.text()
    const $ = cheerio.load(html)

    const h1 = $('h1').first().text().trim()
    const h2 = $('h2').first().text().trim()
    const fullText = $('body').text()

    const extractField = (label: string): string | null => {
      // Try structured data first: label in a dt/th followed by dd/td
      const labelEl = $(`dt:contains("${label}"), th:contains("${label}"), .label:contains("${label}"), span:contains("${label}")`)
      if (labelEl.length) {
        const valueEl = labelEl.first().next()
        const val = valueEl.text().trim()
        if (val && val.length > 1 && val.length < 500) return val
      }
      // Fallback: regex on full text
      const regex = new RegExp(`${label}[:\\s]*([^\\n]{3,300})`, 'u')
      const match = fullText.match(regex)
      return match?.[1]?.trim() || null
    }

    const publisher = extractField('שם המפרסם')
    const publishDate = extractField('תאריך פרסום')
    const deadline = extractField('מועד אחרון להגשה') || extractField('מועד אחרון')
    const mahut = extractField('מהות ההתקשרות') || extractField('תיאור')

    result.type = h1 || null
    result.title = h2 || null
    result.publisher = publisher
    result.publishDate = normalizeDate(publishDate)
    result.deadline = normalizeDate(deadline)
    result.description = mahut

    // Check if we got enough from cheerio
    if (result.title || result.publisher) {
      result.method = 'cheerio'
      return result
    }

    console.log('[hashkal-enrich] Phase A: no data from cheerio, html size:', html.length)
  } catch (err: any) {
    console.log('[hashkal-enrich] Phase A fetch error:', err?.message)
  }

  // Phase B: xAI with web_search
  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) {
    console.log('[hashkal-enrich] XAI_API_KEY not set, skipping Phase B')
    return result
  }

  try {
    console.log('[hashkal-enrich] Phase B: using xAI web_search for', url)
    const res = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'grok-4-fast-non-reasoning',
        input: [
          { role: 'system', content: 'You extract metadata from Israeli government tender pages. Output JSON only, no markdown.' },
          {
            role: 'user', content: `Visit this Israeli government tender page and extract the metadata:
${url}

Return JSON only:
{"title": "tender name/subject", "type": "כוונה להתקשרות/פטור/מכרז פומבי/etc", "publisher": "שם המפרסם", "publish_date": "YYYY-MM-DD", "deadline": "YYYY-MM-DD or null if expired/missing", "description": "מהות ההתקשרות summary"}

Date format: DD/MM/YYYY in source → YYYY-MM-DD in output.
If deadline says "חלף" (expired), output null.
If you cannot access the page, return all null.`,
          },
        ],
        tools: [{ type: 'web_search' }],
      }),
      signal: AbortSignal.timeout(30000),
    })

    if (!res.ok) {
      console.log('[hashkal-enrich] xAI HTTP error:', res.status)
      return result
    }

    const data = await res.json()
    const text = data.output
      ?.filter((b: any) => b.type === 'message')
      .flatMap((b: any) => b.content)
      .filter((c: any) => c.type === 'output_text')
      .map((c: any) => c.text)
      .join('') || ''

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.log('[hashkal-enrich] xAI returned no JSON')
      return result
    }

    const parsed = JSON.parse(jsonMatch[0])
    result.title = parsed.title || null
    result.type = parsed.type || null
    result.publisher = parsed.publisher || null
    result.publishDate = normalizeDate(parsed.publish_date)
    result.deadline = normalizeDate(parsed.deadline)
    result.description = parsed.description || null
    result.method = (result.title || result.publisher) ? 'xai' : 'none'
  } catch (err: any) {
    console.log('[hashkal-enrich] Phase B error:', err?.message)
  }

  return result
}

export async function POST(request: Request) {
  if (!(await verifyAccess(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[hashkal-enrich] === Starting hashkal metadata enrichment ===')
  const serviceClient = await createServiceClient()

  // Find hashkal source(s) by scraper type
  const { data: hashkalSources } = await serviceClient
    .from('tender_sources')
    .select('id')
    .or('source_type.eq.scraper,config->>scraper.eq.mr_gov')

  const sourceIds = hashkalSources?.map((s: any) => s.id) || []
  if (sourceIds.length === 0) {
    console.log('[hashkal-enrich] No hashkal sources found')
    return NextResponse.json({ processed: 0, message: 'No hashkal sources found' })
  }

  // Get up to 10 unenriched tenders
  const { data: tenders, error } = await serviceClient
    .from('tender_pool')
    .select('id, title, url, external_id')
    .in('source_id', sourceIds)
    .is('metadata_enriched_at', null)
    .eq('status', 'open')
    .order('scraped_at', { ascending: false })
    .limit(10)

  if (error) {
    console.error('[hashkal-enrich] Query error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!tenders || tenders.length === 0) {
    console.log('[hashkal-enrich] No tenders to enrich')
    return NextResponse.json({ processed: 0, enrichedSuccess: 0, partial: 0, failed: 0, remaining: 0 })
  }

  console.log('[hashkal-enrich] Processing', tenders.length, 'tenders')

  let enrichedSuccess = 0
  let partial = 0
  let failed = 0

  for (const tender of tenders) {
    const url = tender.url
    if (!url || !url.includes('mr.gov.il')) {
      console.log('[hashkal-enrich] Skipping, no valid URL:', tender.external_id)
      await serviceClient.from('tender_pool').update({
        metadata_enriched_at: new Date().toISOString(),
        metadata_enrichment_status: 'error',
      }).eq('id', tender.id)
      failed++
      continue
    }

    console.log('[hashkal-enrich] Processing:', url)

    const result = await enrichFromHtml(url)
    console.log('[hashkal-enrich] Phase A result:', {
      publisher: result.publisher, title: result.title, deadline: result.deadline, method: result.method,
    })

    if (result.method === 'none') {
      console.log('[hashkal-enrich] Final: not_found')
      await serviceClient.from('tender_pool').update({
        metadata_enriched_at: new Date().toISOString(),
        metadata_enrichment_status: 'not_found',
      }).eq('id', tender.id)
      failed++
      continue
    }

    // Build update payload
    const update: Record<string, any> = {
      metadata_enriched_at: new Date().toISOString(),
    }

    // Title: use enriched title, replace generic "מכרז XXXX" titles
    if (result.title) {
      update.title = result.title
    }

    // Description: type + mahut
    if (result.type || result.description) {
      const parts = [result.type, result.description].filter(Boolean)
      update.description = parts.join(' — ')
    }

    if (result.publisher) update.publisher = result.publisher
    if (result.publishDate) update.publish_date = result.publishDate
    if (result.deadline) update.deadline = result.deadline

    const hasTitle = !!result.title
    const hasPublisher = !!result.publisher
    const status = (hasTitle && hasPublisher) ? 'success' : 'partial'
    update.metadata_enrichment_status = status

    console.log('[hashkal-enrich] Final:', status, update.title?.slice(0, 50))

    await serviceClient.from('tender_pool').update(update).eq('id', tender.id)

    if (status === 'success') enrichedSuccess++
    else partial++
  }

  // Count remaining
  const { count: remaining } = await serviceClient
    .from('tender_pool')
    .select('*', { count: 'exact', head: true })
    .in('source_id', sourceIds)
    .is('metadata_enriched_at', null)
    .eq('status', 'open')

  console.log(`[hashkal-enrich] === Done: success=${enrichedSuccess} partial=${partial} failed=${failed} remaining=${remaining} ===`)

  return NextResponse.json({
    processed: tenders.length,
    enrichedSuccess,
    partial,
    failed,
    remaining: remaining || 0,
  })
}
