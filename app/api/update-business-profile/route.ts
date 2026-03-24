import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
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

    // Load existing profile and deep-merge
    const { data: company } = await supabase
      .from('companies')
      .select('business_profile')
      .eq('id', user.id)
      .single()

    const existing = (company?.business_profile ?? {}) as Partial<BusinessProfile>
    const updated: Partial<BusinessProfile> = { ...existing, ...partial }

    const { error } = await supabase
      .from('companies')
      .update({ business_profile: updated })
      .eq('id', user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, profile: updated })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
