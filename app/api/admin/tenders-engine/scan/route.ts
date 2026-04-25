export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { scrapeMrGov } from '@/lib/tender-scrapers/mr-gov'
import { scrapeMashcalPdfs } from '@/lib/tender-scrapers/mashcal-pdf'
import { scrapePublicCompanies } from '@/lib/tender-scrapers/public-companies'
import { scrapePublicTenderUrls } from '@/lib/tender-scrapers/public-tender-urls'
import type { TenderPoolItem, TenderSource } from '@/lib/tender-scrapers/types'

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

async function createAuthClient() {
  const cookieStore = await cookies()
  return createServerClient(
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
}

async function verifyAdmin(): Promise<boolean> {
  try {
    const supabase = await createAuthClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false
    const serviceClient = await createServiceClient()
    const { data: role } = await serviceClient
      .from('user_roles').select('is_admin').eq('user_id', user.id).single()
    return role?.is_admin === true
  } catch {
    return false
  }
}

async function runScraper(source: TenderSource): Promise<TenderPoolItem[]> {
  const scraperName = source.config?.scraper || source.source_type
  switch (scraperName) {
    case 'mr_gov':
      return scrapeMrGov()
    case 'mashcal_pdf':
      return scrapeMashcalPdfs()
    case 'public_tender_urls':
      return scrapePublicTenderUrls(source)
    case 'ai_search':
      return scrapePublicCompanies(source)
    default:
      throw new Error(`Unknown scraper: ${scraperName}`)
  }
}

async function scanSource(source: TenderSource, serviceClient: any) {
  // Capture console.log output during scan
  const logs: string[] = []
  const origLog = console.log
  const origWarn = console.warn
  console.log = (...args: any[]) => { logs.push(args.map(String).join(' ')); origLog(...args) }
  console.warn = (...args: any[]) => { logs.push('[WARN] ' + args.map(String).join(' ')); origWarn(...args) }

  // Mark as running
  await serviceClient
    .from('tender_sources')
    .update({ last_scan_status: 'running' })
    .eq('id', source.id)

  try {
    // Pre-scan cleanup: delete expired tenders for this source
    const scraperName = source.config?.scraper || source.source_type
    if (scraperName === 'mr_gov' || scraperName === 'public_tender_urls') {
      const today = new Date().toISOString().split('T')[0]
      const { count: expiredDeleted } = await serviceClient
        .from('tender_pool')
        .delete({ count: 'exact' })
        .eq('source_id', source.id)
        .lt('deadline', today)
        .not('deadline', 'is', null)
      if (expiredDeleted && expiredDeleted > 0) {
        console.log(`[scan] Pre-scan cleanup: deleted ${expiredDeleted} expired tenders for ${source.name}`)
      }
    }

    const items = await runScraper(source)

    // Upsert tenders into tender_pool
    // For scrapers (hashkal/mr_gov), only upsert scraper-known fields.
    // Enrichment-managed fields (deadline, publisher, description) are NOT included
    // so Postgres preserves them on conflict update.
    // For adapter-sourced tenders, all fields are populated — include everything.
    let upsertCount = 0
    const upsertErrors: string[] = []
    for (const item of items) {
      const isFromAdapter = item.raw_data?.source === 'adapter'

      let payload: Record<string, any>
      if (isFromAdapter) {
        // Adapter provides full data — upsert everything + mark as enriched
        payload = {
          source_id: source.id,
          external_id: item.external_id,
          title: item.title,
          description: item.description || null,
          publisher: item.publisher || null,
          category: item.category || null,
          publish_date: item.publish_date || null,
          deadline: item.deadline || null,
          url: item.url || null,
          budget: item.budget || null,
          location: item.location || null,
          contact_info: item.contact_info || null,
          status: 'open',
          raw_data: item.raw_data || null,
          scraped_at: new Date().toISOString(),
          metadata_enriched_at: new Date().toISOString(),
          metadata_enrichment_status: 'success',
        }
      } else {
        // Scraper provides partial data — only include scraper-known fields.
        // Omit deadline, description, publisher so enrichment values are preserved on conflict.
        payload = {
          source_id: source.id,
          external_id: item.external_id,
          title: item.title,
          url: item.url || null,
          category: item.category || null,
          status: 'open',
          raw_data: item.raw_data || null,
          scraped_at: new Date().toISOString(),
        }
        // Only set publisher/publish_date if scraper actually has them (from listing page)
        if (item.publisher) payload.publisher = item.publisher
        if (item.publish_date) payload.publish_date = item.publish_date
      }

      const { error } = await serviceClient
        .from('tender_pool')
        .upsert(payload, { onConflict: 'source_id,external_id' })
      if (error) {
        upsertErrors.push(`${item.external_id}: ${error.message}`)
      } else {
        upsertCount++
      }
    }

    if (upsertErrors.length > 0) {
      logs.push(`[scan] Upsert errors: ${upsertErrors.slice(0, 5).join('; ')}`)
    }

    // Close expired tenders
    const today = new Date().toISOString().split('T')[0]
    await serviceClient
      .from('tender_pool')
      .update({ status: 'closed' })
      .eq('source_id', source.id)
      .lt('deadline', today)
      .eq('status', 'open')

    // Get total count for this source
    const { count } = await serviceClient
      .from('tender_pool')
      .select('*', { count: 'exact', head: true })
      .eq('source_id', source.id)

    // Update source status
    await serviceClient
      .from('tender_sources')
      .update({
        last_scan_status: 'success',
        last_scanned_at: new Date().toISOString(),
        last_error: null,
        total_tenders_found: count || 0,
      })
      .eq('id', source.id)

    return { source: source.name, found: items.length, upserted: upsertCount, total: count, logs }
  } catch (err: any) {
    logs.push(`[scan] FATAL: ${err?.message}`)
    await serviceClient
      .from('tender_sources')
      .update({
        last_scan_status: 'error',
        last_scanned_at: new Date().toISOString(),
        last_error: err?.message || 'Unknown error',
      })
      .eq('id', source.id)

    return { source: source.name, error: err?.message, logs }
  } finally {
    console.log = origLog
    console.warn = origWarn
  }
}

export async function POST(request: Request) {
  const isAdmin = await verifyAdmin()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceClient = await createServiceClient()

  let body: any = {}
  try { body = await request.json() } catch {}

  const sourceId = body.source_id

  // Fetch sources to scan
  let query = serviceClient.from('tender_sources').select('*').eq('enabled', true)
  if (sourceId) {
    query = serviceClient.from('tender_sources').select('*').eq('id', sourceId)
  }
  const { data: sources, error } = await query
  if (error || !sources?.length) {
    return NextResponse.json({ error: 'No sources found', details: error?.message }, { status: 404 })
  }

  const results = []
  for (const source of sources) {
    const result = await scanSource(source as TenderSource, serviceClient)
    results.push(result)
  }

  // Fire-and-forget enrichment for hashkal tenders (staggered 4x for larger batches)
  const hasHashkal = sources.some((s: any) => s.config?.scraper === 'mr_gov' || s.source_type === 'scraper')
  if (hasHashkal) {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.nsradar.co.il'
    const enrichUrl = `${baseUrl}/api/admin/tenders-engine/enrich-hashkal`
    const enrichHeaders = { 'Authorization': `Bearer ${process.env.CRON_SECRET}` }
    for (let i = 0; i < 8; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 1000))
      fetch(enrichUrl, { method: 'POST', headers: enrichHeaders })
        .catch(e => console.error(`[scan] Enrich trigger ${i} failed:`, e?.message))
    }
    console.log('[scan] Hashkal enrichment triggered 8x in background (30/batch)')
  }

  // Fire-and-forget enrichment for public tender URLs
  const hasPublicUrls = sources.some((s: any) => s.config?.scraper === 'public_tender_urls')
  if (hasPublicUrls) {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.nsradar.co.il'
    const enrichUrl = `${baseUrl}/api/admin/tenders-engine/enrich-public`
    const enrichHeaders = { 'Authorization': `Bearer ${process.env.CRON_SECRET}` }
    for (let i = 0; i < 4; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 1000))
      fetch(enrichUrl, { method: 'POST', headers: enrichHeaders })
        .catch(e => console.error(`[scan] Public enrich trigger ${i} failed:`, e?.message))
    }
    console.log('[scan] Public tender enrichment triggered 4x in background')
  }

  return NextResponse.json({ success: true, results })
}

// GET — fetch sources and pool stats
export async function GET() {
  const isAdmin = await verifyAdmin()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceClient = await createServiceClient()

  const [
    { data: sources },
    { data: openTenders, count: openCount },
    { data: closedTenders, count: closedCount },
  ] = await Promise.all([
    serviceClient.from('tender_sources').select('*').order('created_at'),
    serviceClient.from('tender_pool').select('*', { count: 'exact' }).eq('status', 'open').order('deadline', { ascending: true }),
    serviceClient.from('tender_pool').select('id', { count: 'exact', head: true }).neq('status', 'open'),
  ])

  // Count new this week
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  const { count: newThisWeek } = await serviceClient
    .from('tender_pool')
    .select('*', { count: 'exact', head: true })
    .gte('scraped_at', weekAgo.toISOString())

  return NextResponse.json({
    sources: sources || [],
    tenders: openTenders || [],
    stats: {
      open: openCount || 0,
      closed: closedCount || 0,
      newThisWeek: newThisWeek || 0,
    },
  })
}

// DELETE — delete a tender from pool
export async function DELETE(request: Request) {
  const isAdmin = await verifyAdmin()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const serviceClient = await createServiceClient()
  const { error } = await serviceClient.from('tender_pool').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
