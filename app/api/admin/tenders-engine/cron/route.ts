export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { scrapeMrGov } from '@/lib/tender-scrapers/mr-gov'
import { scrapeMashcalPdfs } from '@/lib/tender-scrapers/mashcal-pdf'
import { scrapePublicCompanies } from '@/lib/tender-scrapers/public-companies'
import type { TenderSource, TenderPoolItem } from '@/lib/tender-scrapers/types'

function createServiceClient() {
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

function runScraper(source: TenderSource): Promise<TenderPoolItem[]> {
  const scraperName = source.config?.scraper || source.source_type
  switch (scraperName) {
    case 'mr_gov':
      return scrapeMrGov()
    case 'mashcal_pdf':
      return scrapeMashcalPdfs()
    case 'ai_search':
      return scrapePublicCompanies(source)
    default:
      throw new Error(`Unknown scraper: ${scraperName}`)
  }
}

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceClient = createServiceClient()

  const { data: sources } = await serviceClient
    .from('tender_sources').select('*').eq('enabled', true)

  if (!sources?.length) {
    return NextResponse.json({ message: 'No enabled sources' })
  }

  const results = []

  for (const source of sources) {
    await serviceClient
      .from('tender_sources')
      .update({ last_scan_status: 'running' })
      .eq('id', source.id)

    try {
      const items = await runScraper(source as TenderSource)

      let upsertCount = 0
      for (const item of items) {
        const { error } = await serviceClient
          .from('tender_pool')
          .upsert({
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
          }, { onConflict: 'source_id,external_id' })
        if (!error) upsertCount++
      }

      // Close expired
      const today = new Date().toISOString().split('T')[0]
      await serviceClient
        .from('tender_pool')
        .update({ status: 'closed' })
        .eq('source_id', source.id)
        .lt('deadline', today)
        .eq('status', 'open')

      const { count } = await serviceClient
        .from('tender_pool')
        .select('*', { count: 'exact', head: true })
        .eq('source_id', source.id)

      await serviceClient
        .from('tender_sources')
        .update({
          last_scan_status: 'success',
          last_scanned_at: new Date().toISOString(),
          last_error: null,
          total_tenders_found: count || 0,
        })
        .eq('id', source.id)

      results.push({ source: source.name, found: items.length, upserted: upsertCount })
    } catch (err: any) {
      await serviceClient
        .from('tender_sources')
        .update({
          last_scan_status: 'error',
          last_scanned_at: new Date().toISOString(),
          last_error: err?.message || 'Unknown error',
        })
        .eq('id', source.id)

      results.push({ source: source.name, error: err?.message })
    }
  }

  return NextResponse.json({ success: true, results })
}
