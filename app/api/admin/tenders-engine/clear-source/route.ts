export const dynamic = 'force-dynamic'

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

// DELETE — clear all tenders for a source (keeps the source itself)
export async function DELETE(request: Request) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const sourceId = searchParams.get('id')
  if (!sourceId) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const sc = await createServiceClient()

  // Get source name for response
  const { data: source } = await sc
    .from('tender_sources')
    .select('id, name')
    .eq('id', sourceId)
    .single()

  if (!source) return NextResponse.json({ error: 'Source not found' }, { status: 404 })

  // Delete all tenders for this source
  const { count, error } = await sc
    .from('tender_pool')
    .delete({ count: 'exact' })
    .eq('source_id', sourceId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Reset source stats
  await sc.from('tender_sources').update({
    total_tenders_found: 0,
    last_scanned_at: null,
    last_scan_status: null,
    last_error: null,
  }).eq('id', sourceId)

  console.log(`[clear-source] Deleted ${count} tenders for source "${source.name}" (${sourceId})`)

  return NextResponse.json({ success: true, deleted: count || 0, source: source.name })
}
