import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import type { BusinessProfile } from '@/types/business-profile'

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const partial: Partial<BusinessProfile> = await request.json().catch(() => ({}))
    if (!partial || Object.keys(partial).length === 0) {
      return NextResponse.json({ error: 'Empty update' }, { status: 400 })
    }

    // Writes use the service role pinned to `.eq('id', user.id)`: with the
    // user's own client the UPDATE matched 0 rows under RLS and this route still
    // answered success, so nothing on the settings page ever actually saved.
    // The user is verified above from the session; they can only touch their row.
    const admin = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { cookies: { getAll: () => [], setAll: () => {} } },
    )

    // Load existing profile and deep-merge
    const { data: company, error: readError } = await admin
      .from('companies')
      .select('business_profile')
      .eq('id', user.id)
      .maybeSingle()
    if (readError) return NextResponse.json({ error: readError.message }, { status: 500 })
    if (!company) return NextResponse.json({ error: 'לא נמצא פרופיל עסק לחשבון הזה' }, { status: 404 })

    const existing = (company?.business_profile ?? {}) as Partial<BusinessProfile>
    const updated: Partial<BusinessProfile> = { ...existing, ...partial }

    const updatePayload: any = { business_profile: updated }
    if (Array.isArray(partial.distributionChannels)) {
      updatePayload.distribution_channels = partial.distributionChannels
    }

    const { data: written, error } = await admin
      .from('companies')
      .update(updatePayload)
      .eq('id', user.id)
      .select('id')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!written || written.length === 0) {
      return NextResponse.json({ error: 'השמירה לא עודכנה במסד הנתונים' }, { status: 500 })
    }

    return NextResponse.json({ success: true, profile: updated })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
