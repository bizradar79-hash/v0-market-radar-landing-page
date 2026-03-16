import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

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

// GET /api/admin/generate-magic-link?list=1 — list all users+companies
export async function GET() {
  const { user, supabase } = await getCallerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: role } = await supabase
    .from('user_roles').select('is_admin').eq('user_id', user.id).single()
  if (!role?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = getAdminClient()

  // List all auth users
  const { data: { users }, error } = await admin.auth.admin.listUsers({ perPage: 200 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Get all companies
  const { data: companies } = await admin
    .from('companies')
    .select('id, name, industry, website, created_at')

  const companiesById = Object.fromEntries((companies || []).map((c: any) => [c.id, c]))

  const list = users.map((u: any) => ({
    id: u.id,
    email: u.email,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at,
    company: companiesById[u.id] || null,
  }))

  return NextResponse.json({ users: list })
}

// POST /api/admin/generate-magic-link — generate impersonation link
export async function POST(request: Request) {
  const { user, supabase } = await getCallerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: role } = await supabase
    .from('user_roles').select('is_admin').eq('user_id', user.id).single()
  if (!role?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { userId } = await request.json()
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  const admin = getAdminClient()

  // Get target user's email
  const { data: { user: target }, error: userErr } = await admin.auth.admin.getUserById(userId)
  if (userErr || !target?.email) {
    return NextResponse.json({ error: userErr?.message || 'User not found' }, { status: 404 })
  }

  // Generate magic link (does not send email — link returned in response only)
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: target.email,
    options: {
      redirectTo: 'https://v0-market-radar-landing-page.vercel.app/impersonate-callback',
    },
  })
  if (linkErr || !link?.properties?.action_link) {
    return NextResponse.json({ error: linkErr?.message || 'Failed to generate link' }, { status: 500 })
  }

  // Force the correct production redirect_to — Supabase may use its "Site URL" setting
  // which could point to a stale preview deployment. Override it directly in the URL.
  const actionUrl = new URL(link.properties.action_link)
  actionUrl.searchParams.set('redirect_to', 'https://v0-market-radar-landing-page.vercel.app/impersonate-callback')

  return NextResponse.json({ url: actionUrl.toString(), email: target.email })
}
