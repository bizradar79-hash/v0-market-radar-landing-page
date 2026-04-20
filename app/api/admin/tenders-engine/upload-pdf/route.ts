export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { parseMashcalPdfBuffer } from '@/lib/tender-scrapers/mashcal-pdf'

async function createServiceClient() {
  // MUST use service role key — tender_pool has admin-only RLS
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  console.log('[upload-pdf] Service client: URL=', url?.substring(0, 30), 'KEY starts with=', key?.substring(0, 10))
  return createServerClient(url, key, {
    cookies: {
      getAll() { return [] },
      setAll() {},
    },
  })
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

    console.log('[upload-pdf] === v3 (verbose DB ops) ===')

    const requestUrl = new URL(request.url)
    const clearAll = requestUrl.searchParams.get('clear') === '1'

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const sourceId = formData.get('source_id') as string | null
    const pubNumberStr = formData.get('pub_number') as string | null

    console.log('[upload-pdf] file:', file?.name, 'size:', file?.size, 'sourceId:', sourceId)

    if (!file || !sourceId) {
      return NextResponse.json({ error: 'file and source_id required' }, { status: 400 })
    }

    if (!file.name.endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF files accepted' }, { status: 400 })
    }

    // Extract pub number and year from filename: meshek-NN-YYYY.pdf
    let pubNum = pubNumberStr ? parseInt(pubNumberStr) : 0
    let year = new Date().getFullYear()
    const filenameMatch = file.name.match(/meshek-(\d+)-(\d+)/)
    if (filenameMatch) {
      pubNum = pubNum || parseInt(filenameMatch[1])
      year = parseInt(filenameMatch[2])
    }
    if (!pubNum) pubNum = Date.now() % 10000
    console.log('[upload-pdf] pubNum:', pubNum, 'year:', year)

    const buffer = Buffer.from(await file.arrayBuffer())
    console.log('[upload-pdf] buffer size:', buffer.length)

    // ── STEP 1: Parse PDF via xAI ──────────────────────────────────────────
    console.log('[upload-pdf] Step 1: calling parseMashcalPdfBuffer (xAI)')
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
    console.log('[upload-pdf] Parsed:', tenders.length, 'tenders')

    if (tenders.length === 0) {
      return NextResponse.json({
        success: true,
        parsed: 0,
        saved: 0,
        logs,
        message: 'xAI returned 0 tenders from this PDF',
      })
    }

    // Log first tender to verify structure
    console.log('[upload-pdf] First tender keys:', Object.keys(tenders[0]))
    console.log('[upload-pdf] First tender:', JSON.stringify(tenders[0]).substring(0, 500))

    // ── STEP 2: Get service client ─────────────────────────────────────────
    const serviceClient = await createServiceClient()

    // ── STEP 3: Delete old tenders ─────────────────────────────────────────
    console.log('[upload-pdf] Step 3: Deleting old tenders')
    console.log('[upload-pdf] Delete filter: source_id=', sourceId, 'clear=', clearAll)

    if (clearAll) {
      // Delete ALL tenders for this source
      const deleteResult = await serviceClient
        .from('tender_pool')
        .delete({ count: 'exact' })
        .eq('source_id', sourceId)
      console.log('[upload-pdf] CLEAR ALL result:', JSON.stringify({
        error: deleteResult.error,
        count: deleteResult.count,
        status: deleteResult.status,
      }))
    } else {
      // Delete only from same publication
      const pattern = `${pubNum}-${year}-%`
      console.log('[upload-pdf] Delete LIKE pattern:', pattern)
      const deleteResult = await serviceClient
        .from('tender_pool')
        .delete({ count: 'exact' })
        .eq('source_id', sourceId)
        .like('external_id', pattern)
      console.log('[upload-pdf] Delete result:', JSON.stringify({
        error: deleteResult.error,
        count: deleteResult.count,
        status: deleteResult.status,
      }))
    }

    // ── STEP 4: Batch insert with per-row fallback ──────────────────────────
    console.log('[upload-pdf] Step 4: Inserting', tenders.length, 'tenders in batches of 5')
    let upsertCount = 0
    const errors: string[] = []
    const now = new Date().toISOString()

    // Build rows
    const rows = tenders.map((item: any) => ({
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
      scraped_at: now,
    }))

    // Log first row
    console.log('[upload-pdf] First row payload:', JSON.stringify(rows[0]))

    // Insert in batches of 5
    for (let i = 0; i < rows.length; i += 5) {
      const batch = rows.slice(i, i + 5)
      const { error, data } = await serviceClient
        .from('tender_pool')
        .upsert(batch, { onConflict: 'source_id,external_id' })
        .select('id')

      if (error) {
        console.error(`[upload-pdf] Batch ${i}-${i + batch.length} failed:`, error.message, 'code:', error.code)
        // Try one-by-one for this batch to save what we can
        for (const row of batch) {
          const { error: singleErr } = await serviceClient
            .from('tender_pool')
            .upsert([row], { onConflict: 'source_id,external_id' })
          if (singleErr) {
            const errMsg = `${row.external_id}: ${singleErr.message} (code: ${singleErr.code})`
            errors.push(errMsg)
            console.error('[upload-pdf] Single row failed:', errMsg, 'deadline:', row.deadline)
          } else {
            upsertCount++
          }
        }
      } else {
        upsertCount += (data?.length ?? batch.length)
      }

      console.log(`[upload-pdf] Progress: ${Math.min(i + 5, rows.length)}/${rows.length} (success: ${upsertCount}, errors: ${errors.length})`)
    }

    // ── STEP 5: Verify DB state ────────────────────────────────────────────
    console.log('[upload-pdf] Step 5: Verifying DB state')
    const { count: finalCount, error: countError } = await serviceClient
      .from('tender_pool')
      .select('*', { count: 'exact', head: true })
      .eq('source_id', sourceId)

    console.log('[upload-pdf] Actual rows in DB for this source:', finalCount, 'error:', countError?.message || 'none')

    // ── STEP 6: Update source stats ────────────────────────────────────────
    if (upsertCount === 0 && errors.length > 0) {
      // ALL inserts failed
      await serviceClient
        .from('tender_sources')
        .update({
          last_scan_status: 'error',
          last_scanned_at: new Date().toISOString(),
          last_error: `Insert failed: ${errors[0]}`,
        })
        .eq('id', sourceId)

      console.error('[upload-pdf] ALL INSERTS FAILED. First 5 errors:', errors.slice(0, 5))
      return NextResponse.json({
        success: false,
        error: 'All inserts failed',
        parsed: tenders.length,
        saved: 0,
        errors: errors.slice(0, 5),
        logs,
        dbCount: finalCount,
      }, { status: 500 })
    } else if (upsertCount > 0 && errors.length > 0) {
      // Partial success
      await serviceClient
        .from('tender_sources')
        .update({
          last_scan_status: 'success',
          last_scanned_at: new Date().toISOString(),
          last_error: `Partial: ${errors.length} of ${tenders.length} failed`,
          total_tenders_found: finalCount || 0,
        })
        .eq('id', sourceId)
    } else {
      // Full success
      await serviceClient
        .from('tender_sources')
        .update({
          last_scan_status: 'success',
          last_scanned_at: new Date().toISOString(),
          last_error: null,
          total_tenders_found: finalCount || 0,
        })
        .eq('id', sourceId)
    }

    console.log('[upload-pdf] === DONE ===')
    console.log('[upload-pdf] Parsed:', tenders.length, 'Inserted:', upsertCount, 'Errors:', errors.length, 'DB count:', finalCount)

    return NextResponse.json({
      success: true,
      parsed: tenders.length,
      saved: upsertCount,
      deleted: clearAll ? 'all' : `pattern ${pubNum}-${year}-%`,
      dbCount: finalCount,
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
