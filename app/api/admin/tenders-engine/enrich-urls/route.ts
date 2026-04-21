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
  // Accept CRON_SECRET bearer token
  const auth = request.headers.get('authorization')
  if (auth === `Bearer ${process.env.CRON_SECRET}` && process.env.CRON_SECRET) {
    return true
  }
  // Or admin session
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

async function enrichSingleTender(
  tender: { id: string; title: string; publisher: string | null; deadline: string | null; raw_data: any },
  serviceClient: any,
): Promise<'success' | 'not_found' | 'error'> {
  const city = tender.publisher || ''
  const tenderNumber = tender.raw_data?.xai_parsed?.tender_number || ''
  const title = tender.title || ''
  const deadline = tender.deadline || ''

  console.log('[enrich] Trying:', city, tenderNumber, '-', title.slice(0, 50))

  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) {
    console.error('[enrich] XAI_API_KEY not set')
    await serviceClient.from('tender_pool').update({
      url_enriched_at: new Date().toISOString(),
      url_enrichment_status: 'error',
    }).eq('id', tender.id)
    return 'error'
  }

  try {
    const res = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'grok-4-fast-non-reasoning',
        input: [
          { role: 'system', content: 'You find direct URLs to Israeli municipal tenders. Output JSON only.' },
          {
            role: 'user', content: `Find the direct URL to this tender published on the city's official website or official tender portal:

City: ${city}
Tender number: ${tenderNumber}
Title: ${title}
Deadline: ${deadline}

Search the web for the city's official tender page and find the specific tender listing or PDF. The URL should point DIRECTLY to the tender (not the city's homepage or a general tenders list).

Common patterns:
- https://www.{city-domain}.muni.il/tenders/{id}
- https://www.{city}.org.il/tender/...
- Direct PDF on city site

If you CANNOT find a specific direct URL with high confidence, output null.
Do NOT return homepage URLs or general tender listing pages as a fallback.

Output JSON only:
{"url": "https://..." or null, "confidence": "high"|"low"}`,
          },
        ],
        tools: [{ type: 'web_search' }],
      }),
      signal: AbortSignal.timeout(30000),
    })

    if (!res.ok) {
      console.error('[enrich] xAI HTTP error:', res.status)
      await serviceClient.from('tender_pool').update({
        url_enriched_at: new Date().toISOString(),
        url_enrichment_status: 'error',
      }).eq('id', tender.id)
      return 'error'
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
      console.log('[enrich] Result: not_found (no JSON)')
      await serviceClient.from('tender_pool').update({
        url_enriched_at: new Date().toISOString(),
        url_enrichment_status: 'not_found',
      }).eq('id', tender.id)
      return 'not_found'
    }

    const parsed = JSON.parse(jsonMatch[0])
    const foundUrl = parsed.url
    const confidence = parsed.confidence

    if (foundUrl && confidence === 'high') {
      console.log('[enrich] Result: success', foundUrl.slice(0, 80))
      await serviceClient.from('tender_pool').update({
        url: foundUrl,
        url_enriched_at: new Date().toISOString(),
        url_enrichment_status: 'success',
      }).eq('id', tender.id)
      return 'success'
    } else {
      console.log('[enrich] Result: not_found (confidence:', confidence, ')')
      await serviceClient.from('tender_pool').update({
        url_enriched_at: new Date().toISOString(),
        url_enrichment_status: 'not_found',
      }).eq('id', tender.id)
      return 'not_found'
    }
  } catch (err: any) {
    console.error('[enrich] Error:', err?.message)
    await serviceClient.from('tender_pool').update({
      url_enriched_at: new Date().toISOString(),
      url_enrichment_status: 'error',
    }).eq('id', tender.id)
    return 'error'
  }
}

export async function POST(request: Request) {
  if (!(await verifyAccess(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[enrich] === Starting URL enrichment ===')
  const serviceClient = await createServiceClient()

  // Get up to 10 mashcal tenders not yet enriched
  const { data: tenders, error } = await serviceClient
    .from('tender_pool')
    .select('id, title, publisher, deadline, raw_data')
    .eq('status', 'open')
    .is('url_enriched_at', null)
    .eq('category', 'רשויות מקומיות')
    .order('scraped_at', { ascending: false })
    .limit(10)

  if (error) {
    console.error('[enrich] Query error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!tenders || tenders.length === 0) {
    console.log('[enrich] No tenders to enrich')
    return NextResponse.json({ processed: 0, enriched: 0, notFound: 0, errors: 0, remaining: 0 })
  }

  console.log('[enrich] Processing', tenders.length, 'tenders')

  let enriched = 0
  let notFound = 0
  let errors = 0

  for (const tender of tenders) {
    const result = await enrichSingleTender(tender, serviceClient)
    if (result === 'success') enriched++
    else if (result === 'not_found') notFound++
    else errors++
  }

  // Count remaining
  const { count: remaining } = await serviceClient
    .from('tender_pool')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'open')
    .is('url_enriched_at', null)
    .eq('category', 'רשויות מקומיות')

  console.log(`[enrich] === Done: enriched=${enriched} notFound=${notFound} errors=${errors} remaining=${remaining} ===`)

  return NextResponse.json({
    processed: tenders.length,
    enriched,
    notFound,
    errors,
    remaining: remaining || 0,
  })
}
