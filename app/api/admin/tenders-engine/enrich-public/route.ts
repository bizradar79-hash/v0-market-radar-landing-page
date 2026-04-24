export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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

function extractXaiText(data: any): string {
  return data.output
    ?.filter((b: any) => b.type === 'message')
    .flatMap((b: any) => b.content)
    .filter((c: any) => c.type === 'output_text')
    .map((c: any) => c.text)
    .join('') || ''
}

function normalizeDate(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (trimmed.includes('חלף') || trimmed.includes('עבר')) return null

  const dmy = trimmed.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/)
  if (dmy) {
    const [, d, m, y] = dmy
    const month = parseInt(m)
    const day = parseInt(d)
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return iso[0]

  return null
}

async function enrichTenderViaXai(url: string): Promise<any> {
  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) throw new Error('XAI_API_KEY not set')

  const res = await fetch('https://api.x.ai/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'grok-4-fast-non-reasoning',
      tools: [{ type: 'web_search' }],
      input: [
        { role: 'system', content: 'Extract tender details from Hebrew tender pages. Output JSON only, no markdown.' },
        {
          role: 'user', content: `Visit this tender URL: ${url}

Extract these fields:
- title (שם המכרז) — the tender name/description
- publisher (מפרסם) — organization publishing the tender
- deadline (מועד אחרון להגשה) — YYYY-MM-DD or null
- category — one of: שירותים, ציוד, עבודות, ייעוץ, IT, בריאות, תשתיות, אחר
- tender_type — מכרז / בקשה להצעות / פטור / RFI / כוונה להתקשרות
- description — 1-2 sentences about the tender

If this is NOT a real tender (it's RFI, exemption, just an info page, category page) — return:
{"is_tender": false, "reason": "RFI|exemption|not_found|expired|other"}

Otherwise return:
{"is_tender": true, "title": "...", "publisher": "...", "deadline": "YYYY-MM-DD or null", "category": "...", "tender_type": "...", "description": "..."}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(30000),
  })

  if (!res.ok) throw new Error(`xAI HTTP ${res.status}`)

  const data = await res.json()
  const text = extractXaiText(data)

  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  try {
    return JSON.parse(clean)
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')
    return JSON.parse(jsonMatch[0])
  }
}

export async function POST(request: Request) {
  if (!(await verifyAccess(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[enrich-public] === Starting public tender enrichment ===')
  const serviceClient = await createServiceClient()

  // Find public tender source(s)
  const { data: publicSources } = await serviceClient
    .from('tender_sources')
    .select('id')
    .or('config->>scraper.eq.public_tender_urls,config->>scraper.eq.ai_search')

  const sourceIds = publicSources?.map((s: any) => s.id) || []
  if (sourceIds.length === 0) {
    return NextResponse.json({ processed: 0, message: 'No public tender sources found' })
  }

  // Get up to 10 unenriched tenders
  const { data: tenders, error } = await serviceClient
    .from('tender_pool')
    .select('id, title, url, external_id, publisher')
    .in('source_id', sourceIds)
    .is('metadata_enriched_at', null)
    .eq('status', 'open')
    .order('scraped_at', { ascending: false })
    .limit(10)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!tenders || tenders.length === 0) {
    return NextResponse.json({ processed: 0, enrichedSuccess: 0, failed: 0, skipped: 0, remaining: 0 })
  }

  console.log('[enrich-public] Processing', tenders.length, 'tenders')

  let enrichedSuccess = 0
  let failed = 0
  let skipped = 0
  let expiredDeleted = 0
  const today = new Date().toISOString().split('T')[0]

  for (const tender of tenders) {
    if (!tender.url) {
      await serviceClient.from('tender_pool').update({
        metadata_enriched_at: new Date().toISOString(),
        metadata_enrichment_status: 'error',
      }).eq('id', tender.id)
      failed++
      continue
    }

    try {
      console.log('[enrich-public] Enriching:', tender.url)
      const result = await enrichTenderViaXai(tender.url)

      if (!result.is_tender) {
        console.log('[enrich-public] Not a tender, deleting:', tender.external_id, 'reason:', result.reason)
        await serviceClient.from('tender_pool').delete().eq('id', tender.id)
        skipped++
        continue
      }

      // Check for non-tender types
      const tenderType = result.tender_type || ''
      if (/פטור|RFI|כוונה להתקשרות|בקשה למידע/i.test(tenderType)) {
        console.log('[enrich-public] Skipping non-tender type:', tenderType, tender.external_id)
        await serviceClient.from('tender_pool').delete().eq('id', tender.id)
        skipped++
        continue
      }

      // Check if expired
      const deadline = normalizeDate(result.deadline)
      if (deadline && deadline < today) {
        console.log('[enrich-public] Expired, deleting:', tender.external_id, deadline)
        await serviceClient.from('tender_pool').delete().eq('id', tender.id)
        expiredDeleted++
        continue
      }

      // Update with enriched data
      const update: Record<string, any> = {
        metadata_enriched_at: new Date().toISOString(),
        metadata_enrichment_status: 'success',
      }
      if (result.title) update.title = result.title
      if (result.publisher) update.publisher = result.publisher
      if (deadline) update.deadline = deadline
      if (result.category) update.category = result.category
      if (result.description) update.description = result.description

      await serviceClient.from('tender_pool').update(update).eq('id', tender.id)
      enrichedSuccess++

      console.log('[enrich-public] Success:', result.title?.slice(0, 50), '| deadline:', deadline)
    } catch (err: any) {
      console.warn('[enrich-public] Error enriching', tender.external_id, ':', err?.message)
      await serviceClient.from('tender_pool').update({
        metadata_enriched_at: new Date().toISOString(),
        metadata_enrichment_status: 'error',
      }).eq('id', tender.id)
      failed++
    }
  }

  // Post-enrichment: delete expired
  const { count: postCleanup } = await serviceClient
    .from('tender_pool')
    .delete({ count: 'exact' })
    .in('source_id', sourceIds)
    .lt('deadline', today)
    .not('deadline', 'is', null)
  if (postCleanup && postCleanup > 0) {
    console.log(`[enrich-public] Post-cleanup: deleted ${postCleanup} expired`)
    expiredDeleted += postCleanup
  }

  const { count: remaining } = await serviceClient
    .from('tender_pool')
    .select('*', { count: 'exact', head: true })
    .in('source_id', sourceIds)
    .is('metadata_enriched_at', null)
    .eq('status', 'open')

  console.log(`[enrich-public] === Done: success=${enrichedSuccess} failed=${failed} skipped=${skipped} expired=${expiredDeleted} remaining=${remaining} ===`)

  return NextResponse.json({
    processed: tenders.length,
    enrichedSuccess,
    failed,
    skipped,
    expiredDeleted,
    remaining: remaining || 0,
  })
}
