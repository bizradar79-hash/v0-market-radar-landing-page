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
  isExemption: boolean
}

async function enrichFromHtml(url: string): Promise<EnrichResult> {
  const result: EnrichResult = {
    title: null, type: null, publisher: null,
    publishDate: null, deadline: null, description: null,
    method: 'none', isExemption: false,
  }

  // Phase A: cheerio with targeted selectors for mr.gov.il detail pages
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

    const h1 = $('h1.bids-head').first().text().trim()
    const breadcrumbText = $('.breadcrumb, nav[aria-label="breadcrumb"]').text()

    // Detect exemption notices
    const isExemption =
      /הודעות פטור/.test(breadcrumbText) ||
      /כוונה להתקשרות|הודעת פטור|פטור ממכרז|התקשרות ספק יחיד/.test(h1)

    if (isExemption) {
      console.log('[hashkal-enrich] Detected exemption:', url, 'h1=', h1)
      result.isExemption = true
      result.method = 'cheerio'
      return result
    }

    // --- Targeted extraction using known DOM structure ---

    // Deadline: <span id="lastDate">30/04/2026 ,12:00</span>
    const lastDateRaw = $('#lastDate').text().trim()

    // Publisher: #sub-head-details parent's <h2>
    const publisher = $('#sub-head-details').parent().find('h2').text().trim()

    // Publish date: .date .sub-head sibling span
    const publishDateRaw = $('.date.details-item-wrapper span').first().text().trim()

    // Title: first h2 inside .bids-top-sec-wrapper (after publisher h2)
    // The title is the second h2, or the tender name in h1 sub-section
    // Actually: h1 = type (e.g. "מכרז פומבי"), publisher h2 = publisher name
    // The tender subject is in h2 inside .details-head (same as publisher section)
    // Let's get it from the .bids-head-sub or the main content
    const titleEl = $('h2.search-results-content-head, .bids-body-top-sec h2').first()
    let title = titleEl.text().trim()
    // If the h2 is the publisher, look for a different title element
    if (title === publisher) {
      // Try the h1 sub-text or the mahut
      title = ''
    }

    // Description / mahut: look for "מהות ההתקשרות" or "תיאור" in the main content only
    const mainContent = $('#mainContent')
    const mainText = mainContent.length ? mainContent.text() : $('body').text()

    // Scope text to before "אולי יעניין אותך גם" (related tenders)
    const relatedIdx = mainText.indexOf('אולי יעניין אותך גם')
    const scopedText = relatedIdx > 0 ? mainText.slice(0, relatedIdx) : mainText

    const mahutMatch = scopedText.match(/מהות ההתקשרות[:\s]*([^\n]{3,500})/u)
    const mahut = mahutMatch?.[1]?.trim() || null

    // Also try extracting a better title from scoped text
    if (!title) {
      // Fallback: first h2 in main content that isn't the publisher
      $('h2').each((_, el) => {
        const t = $(el).text().trim()
        if (t && t !== publisher && t.length > 5 && t.length < 300 && !t.includes('אולי יעניין')) {
          title = t
          return false // break
        }
      })
    }

    result.type = h1 || null
    result.title = title || null
    result.publisher = publisher || null
    result.publishDate = normalizeDate(publishDateRaw)
    result.deadline = normalizeDate(lastDateRaw)
    result.description = mahut

    const deadlineMatches = (html.match(/מועד אחרון להגשה/g) || []).length
    console.log('[hashkal-enrich] Cheerio extraction:', {
      deadline: result.deadline, deadlineRaw: lastDateRaw || 'EMPTY',
      deadlineMatchesInHtml: deadlineMatches,
      publisher: result.publisher?.slice(0, 40),
      publishDate: result.publishDate,
      title: result.title?.slice(0, 50),
    })

    // Check if we got enough from cheerio
    if (result.title || result.publisher || result.deadline) {
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

async function enrichViaXai(url: string): Promise<{ title?: string; publisher?: string; deadline?: string } | null> {
  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) return null

  try {
    console.log('[hashkal-enrich] enrichViaXai for', url)
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
            role: 'user', content: `Visit this Israeli government tender page and extract basic metadata:
${url}

Return JSON only:
{"title": "tender name/subject or null", "publisher": "שם המפרסם or null", "deadline": "YYYY-MM-DD or null if expired/missing"}

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
      console.log('[hashkal-enrich] enrichViaXai HTTP error:', res.status)
      return null
    }

    const data = await res.json()
    const text = data.output
      ?.filter((b: any) => b.type === 'message')
      .flatMap((b: any) => b.content)
      .filter((c: any) => c.type === 'output_text')
      .map((c: any) => c.text)
      .join('') || ''

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])
    return {
      title: parsed.title || undefined,
      publisher: parsed.publisher || undefined,
      deadline: normalizeDate(parsed.deadline) || undefined,
    }
  } catch (err: any) {
    console.log('[hashkal-enrich] enrichViaXai error:', err?.message)
    return null
  }
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

  // Get up to 30 unenriched tenders per batch
  const { data: tenders, error } = await serviceClient
    .from('tender_pool')
    .select('id, title, url, external_id')
    .in('source_id', sourceIds)
    .is('metadata_enriched_at', null)
    .eq('status', 'open')
    .order('scraped_at', { ascending: false })
    .limit(30)

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
  let skippedExemptions = 0
  let expiredDeleted = 0

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
    console.log('[hashkal-enrich] Result:', {
      publisher: result.publisher, title: result.title, deadline: result.deadline,
      method: result.method, isExemption: result.isExemption,
    })

    // Delete exemption notices — they aren't real tenders
    if (result.isExemption) {
      console.log('[hashkal-enrich] Deleting exemption:', tender.external_id)
      await serviceClient.from('tender_pool').delete().eq('id', tender.id)
      skippedExemptions++
      continue
    }

    // Delete expired tenders (deadline in the past)
    const today = new Date().toISOString().split('T')[0]
    if (result.deadline && result.deadline < today) {
      console.log('[hashkal-enrich] Expired tender, deleting:', tender.external_id, result.deadline)
      await serviceClient.from('tender_pool').delete().eq('id', tender.id)
      expiredDeleted++
      continue
    }

    if (result.method === 'none') {
      // Phase B fallback: try xAI for publisher/deadline only
      const xaiResult = await enrichViaXai(tender.url)
      if (xaiResult) {
        if (xaiResult.deadline && xaiResult.deadline < today) {
          console.log('[hashkal-enrich] Expired (xAI), deleting:', tender.external_id)
          await serviceClient.from('tender_pool').delete().eq('id', tender.id)
          expiredDeleted++
          continue
        }
        const update: Record<string, any> = {
          metadata_enriched_at: new Date().toISOString(),
          metadata_enrichment_status: 'partial',
        }
        if (xaiResult.publisher) update.publisher = xaiResult.publisher
        if (xaiResult.deadline) update.deadline = xaiResult.deadline
        if (xaiResult.title) update.title = xaiResult.title
        await serviceClient.from('tender_pool').update(update).eq('id', tender.id)
        partial++
        continue
      }

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

  // Post-enrichment cleanup: delete any tenders with past deadline (across all hashkal)
  const today = new Date().toISOString().split('T')[0]
  const { count: postCleanup } = await serviceClient
    .from('tender_pool')
    .delete({ count: 'exact' })
    .in('source_id', sourceIds)
    .lt('deadline', today)
    .not('deadline', 'is', null)
  if (postCleanup && postCleanup > 0) {
    console.log(`[hashkal-enrich] Post-cleanup: deleted ${postCleanup} expired tenders`)
    expiredDeleted += postCleanup
  }

  // Count remaining
  const { count: remaining } = await serviceClient
    .from('tender_pool')
    .select('*', { count: 'exact', head: true })
    .in('source_id', sourceIds)
    .is('metadata_enriched_at', null)
    .eq('status', 'open')

  console.log(`[hashkal-enrich] === Done: success=${enrichedSuccess} partial=${partial} failed=${failed} exemptions=${skippedExemptions} expired=${expiredDeleted} remaining=${remaining} ===`)

  return NextResponse.json({
    processed: tenders.length,
    enrichedSuccess,
    partial,
    failed,
    skippedExemptions,
    expiredDeleted,
    remaining: remaining || 0,
  })
}
