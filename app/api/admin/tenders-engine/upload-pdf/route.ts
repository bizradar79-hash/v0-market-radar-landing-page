export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { parseMashcalPdfBuffer } from '@/lib/tender-scrapers/mashcal-pdf'

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

async function verifyAdmin(): Promise<boolean> {
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

export async function POST(request: Request) {
  try {
    if (!(await verifyAdmin())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[upload-pdf] === v2 (xAI forced) ===')

    const url = new URL(request.url)
    const clearAll = url.searchParams.get('clear') === '1'

    const formData = await request.formData()
    console.log('[upload-pdf] formData parsed')

    const file = formData.get('file') as File | null
    const sourceId = formData.get('source_id') as string | null
    const pubNumberStr = formData.get('pub_number') as string | null

    console.log('[upload-pdf] file:', file?.name, file?.size)

    // If clear=1, delete ALL tenders for this source before processing
    if (clearAll && sourceId) {
      const sc = await createServiceClient()
      const { count } = await sc
        .from('tender_pool')
        .delete({ count: 'exact' })
        .eq('source_id', sourceId)
      console.log('[upload-pdf] CLEAR ALL: deleted', count || 0, 'tenders for source', sourceId)
    }

    if (!file || !sourceId) {
      return NextResponse.json({ error: 'file and source_id required' }, { status: 400 })
    }

    if (!file.name.endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF files accepted' }, { status: 400 })
    }

    // Try to extract pub number and year from filename: meshek-NN-YYYY.pdf
    let pubNum = pubNumberStr ? parseInt(pubNumberStr) : 0
    let year = new Date().getFullYear()
    const filenameMatch = file.name.match(/meshek-(\d+)-(\d+)/)
    if (filenameMatch) {
      pubNum = pubNum || parseInt(filenameMatch[1])
      year = parseInt(filenameMatch[2])
    }
    if (!pubNum) pubNum = Date.now() % 10000 // fallback unique number

    const buffer = Buffer.from(await file.arrayBuffer())
    console.log('[upload-pdf] buffer size:', buffer.length)

    console.log('[upload-pdf] calling parseMashcalPdfBuffer (xAI v2)')
    let tenders: any[]
    let logs: string[]
    try {
      const result = await parseMashcalPdfBuffer(buffer, pubNum, year, file.name)
      tenders = result.tenders
      logs = result.logs
    } catch (parseErr: any) {
      console.error('[upload-pdf] parseMashcalPdfBuffer THREW:', parseErr.message)
      return NextResponse.json({
        error: 'Parse failed',
        message: parseErr.message,
        stack: parseErr.stack?.split('\n').slice(0, 5),
      }, { status: 500 })
    }
    console.log('[upload-pdf] parsed', tenders.length, 'tenders')

    const serviceClient = await createServiceClient()

    // Delete old tenders from same publication (removes scrambled garbage from previous attempts)
    const { count: deletedCount } = await serviceClient
      .from('tender_pool')
      .delete({ count: 'exact' })
      .eq('source_id', sourceId)
      .like('external_id', `${pubNum}-${year}-%`)
    console.log('[upload-pdf] Deleted', deletedCount || 0, 'old tenders from same publication')

    // Insert fresh parsed tenders
    console.log('[upload-pdf] upserting to tender_pool')
    let upsertCount = 0
    const errors: string[] = []

    for (const item of tenders) {
      const { error } = await serviceClient
        .from('tender_pool')
        .upsert({
          source_id: sourceId,
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
      if (error) {
        errors.push(`${item.external_id}: ${error.message}`)
      } else {
        upsertCount++
      }
    }
    console.log('[upload-pdf] Upserted', upsertCount, 'new tenders')

    // Update source stats
    const { count } = await serviceClient
      .from('tender_pool')
      .select('*', { count: 'exact', head: true })
      .eq('source_id', sourceId)

    await serviceClient
      .from('tender_sources')
      .update({
        last_scan_status: 'success',
        last_scanned_at: new Date().toISOString(),
        last_error: null,
        total_tenders_found: count || 0,
      })
      .eq('id', sourceId)

    return NextResponse.json({
      success: true,
      parsed: tenders.length,
      saved: upsertCount,
      errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
      logs,
    })
  } catch (error: any) {
    console.error('[upload-pdf] FATAL:', error)
    return NextResponse.json({
      error: error.message,
      name: error.name,
      stack: error.stack?.split('\n').slice(0, 5).join('\n'),
    }, { status: 500 })
  }
}
