export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@/lib/supabase/server'

// PATCH /api/settings/company — saves the settings page's company fields.
//
// Why a server route: browser-side `companies.update()` matched 0 rows for real,
// logged-in users (no RLS UPDATE policy lets them write their own row), and the
// old code ignored the result, so settings never actually saved. Here the user
// is verified from the session cookie, and the write uses the service role but
// is pinned to `.eq('id', user.id)` with an explicit field whitelist — a user
// can only ever change their OWN row, and only these columns.

const SCOPES = new Set(['local', 'national', 'international'])

function str(v: unknown, max: number): string | null | undefined {
  if (v === undefined) return undefined
  if (v === null) return null
  if (typeof v !== 'string') throw new Error('invalid')
  return v.trim().slice(0, max)
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'גוף הבקשה לא תקין' }, { status: 400 })

  const update: Record<string, unknown> = {}
  try {
    const name = str(body.name, 200); if (name !== undefined) update.name = name
    const website = str(body.website, 500); if (website !== undefined) update.website = website
    const description = str(body.description, 5000); if (description !== undefined) update.description = description
    const city = str(body.city, 200); if (city !== undefined) update.city = city || null
    const phone = str(body.phone, 50); if (phone !== undefined) update.phone = phone
    if (body.geographic_scope !== undefined) {
      const arr = Array.isArray(body.geographic_scope) ? body.geographic_scope : [body.geographic_scope]
      if (!arr.every((s: unknown) => typeof s === 'string' && SCOPES.has(s))) throw new Error('invalid')
      update.geographic_scope = arr
    }
    if (body.keywords !== undefined) {
      if (!Array.isArray(body.keywords) || body.keywords.length > 100 || !body.keywords.every((k: unknown) => typeof k === 'string')) throw new Error('invalid')
      update.keywords = body.keywords.map((k: string) => k.trim()).filter(Boolean).slice(0, 100)
    }
  } catch {
    return NextResponse.json({ error: 'אחד השדות לא תקין' }, { status: 400 })
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'אין שדות לעדכון' }, { status: 400 })

  const admin = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
  const { data, error } = await admin.from('companies').update(update).eq('id', user.id).select('id')
  if (error) return NextResponse.json({ error: error.message, code: error.code }, { status: 500 })
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'לא נמצא פרופיל עסק לחשבון הזה' }, { status: 404 })
  }
  return NextResponse.json({ success: true })
}
