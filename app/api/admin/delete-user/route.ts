export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

function getAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

async function getCallerUser() {
  const reqHeaders = await headers()
  const authHeader = reqHeaders.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => [], setAll: () => {} },
        global: { headers: { Authorization: `Bearer ${token}` } } },
    )
    const { data } = await supabase.auth.getUser(token)
    return { user: data?.user, supabase }
  }
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  return { user: data?.user, supabase }
}

export async function DELETE(request: Request) {
  try {
    const { user, supabase } = await getCallerUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: role } = await supabase
      .from('user_roles').select('is_admin').eq('user_id', user.id).single()
    if (!role?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const userId: string | undefined = body.user_id
    if (!userId) return NextResponse.json({ error: 'Missing user_id' }, { status: 400 })

    // Safety: prevent admin from deleting themselves
    if (userId === user.id) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
    }

    const admin = getAdminClient()

    // Delete related data in order to avoid FK conflicts
    const tables = [
      'competitors',
      'news',
      'tenders',
      'conferences',
      'leads',
    ]
    for (const table of tables) {
      const { error } = await admin.from(table).delete().eq('company_id', userId)
      if (error) console.warn(`[delete-user] failed to delete from ${table}:`, error.message)
    }

    // Delete the company row
    const { error: companyError } = await admin.from('companies').delete().eq('id', userId)
    if (companyError) console.warn('[delete-user] failed to delete company:', companyError.message)

    // Delete the auth user (this also removes user_roles via cascade if set up, otherwise ignore)
    const { error: authError } = await admin.auth.admin.deleteUser(userId)
    if (authError) {
      console.error('[delete-user] failed to delete auth user:', authError.message)
      return NextResponse.json({ error: authError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('[delete-user] error:', e?.message)
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
