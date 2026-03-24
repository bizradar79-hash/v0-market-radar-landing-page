import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { BusinessProfile } from '@/types/business-profile'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Load business_profile and existing competitors
    const [{ data: company }, { data: existing }] = await Promise.all([
      supabase.from('companies').select('business_profile').eq('id', user.id).single(),
      supabase.from('competitors').select('name').eq('company_id', user.id),
    ])

    const profile = (company?.business_profile ?? null) as BusinessProfile | null
    if (!profile?.directCompetitors?.length) {
      return NextResponse.json({ success: true, added: 0, message: 'No directCompetitors in profile' })
    }

    const existingNamesLower = new Set((existing || []).map(c => c.name.toLowerCase().trim()))

    const toInsert = profile.directCompetitors
      .filter(name => name?.trim() && !existingNamesLower.has(name.toLowerCase().trim()))
      .map(name => ({
        company_id: user.id,
        name: name.trim(),
        source: 'auto',
        threat_score: 50,
        services: 'מתחרה שזוהה בניתוח עסקי',
        positioning: 'מתחרה ישיר',
        trend: 'stable',
      }))

    if (toInsert.length === 0) {
      return NextResponse.json({ success: true, added: 0, message: 'All profile competitors already exist' })
    }

    const { error } = await supabase.from('competitors').insert(toInsert)
    if (error) {
      console.error('[sync-profile-competitors] insert error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`[sync-profile-competitors] added ${toInsert.length} competitors for user ${user.id}`)
    return NextResponse.json({ success: true, added: toInsert.length })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
