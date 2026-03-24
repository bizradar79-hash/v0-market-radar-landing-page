import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { BusinessProfile } from '@/types/business-profile'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_COMPETITORS = 10

async function enrichCompetitor(name: string, contextHint: string): Promise<{
  services: string
  website: string | null
  threat_score: number
  positioning: string
  trend: string
} | null> {
  try {
    const prompt = `חפש מידע על החברה "${name}"${contextHint ? ` (${contextHint})` : ''}.
מצא: תיאור שירותים/מוצרים, אתר אינטרנט, מיצוב בשוק.
החזר JSON בלבד:
{"services": "", "website": "https://...", "threat_score": 60-100, "positioning": "מוביל שוק/מתחרה ישיר/שחקן חדש", "trend": "growing/stable/declining"}
אם אין אתר ידוע, השאר website כ-null.
CRITICAL: Output ONLY a raw JSON object. No markdown. Start with { and end with }`

    const res = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.XAI_API_KEY}` },
      body: JSON.stringify({
        model: 'grok-4-fast-non-reasoning',
        input: [{ role: 'user', content: prompt }],
        tools: [{ type: 'web_search' }],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data.output) return null

    const text = data.output
      .filter((item: any) => item.type === 'message')
      .flatMap((item: any) => item.content)
      .filter((c: any) => c.type === 'output_text')
      .map((c: any) => c.text)
      .join('')

    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    const s = clean.indexOf('{')
    const e = clean.lastIndexOf('}')
    if (s === -1 || e <= s) return null

    let parsed: any = {}
    try { parsed = JSON.parse(clean.slice(s, e + 1)) } catch { return null }

    const threat = typeof parsed.threat_score === 'number'
      ? Math.max(60, Math.min(100, parsed.threat_score))
      : 60

    return {
      services: typeof parsed.services === 'string' && parsed.services.length > 2 ? parsed.services : '',
      website: typeof parsed.website === 'string' && parsed.website.startsWith('http') ? parsed.website : null,
      threat_score: threat,
      positioning: typeof parsed.positioning === 'string' ? parsed.positioning : 'מתחרה ישיר',
      trend: ['growing', 'stable', 'declining'].includes(parsed.trend) ? parsed.trend : 'stable',
    }
  } catch {
    return null
  }
}

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const [{ data: company }, { data: existing }] = await Promise.all([
      supabase.from('companies').select('business_profile').eq('id', user.id).single(),
      supabase.from('competitors').select('id, name').eq('company_id', user.id),
    ])

    const profile = (company?.business_profile ?? null) as BusinessProfile | null
    if (!profile?.directCompetitors?.length) {
      return NextResponse.json({ success: true, added: 0, message: 'No directCompetitors in profile' })
    }

    const existingCount = (existing || []).length
    const slotsAvailable = Math.max(0, MAX_COMPETITORS - existingCount)
    if (slotsAvailable === 0) {
      return NextResponse.json({ success: true, added: 0, message: 'Competitor limit reached' })
    }

    const existingNamesLower = new Set((existing || []).map((c: any) => c.name.toLowerCase().trim()))
    const newNames = profile.directCompetitors
      .filter(name => name?.trim() && !existingNamesLower.has(name.toLowerCase().trim()))
      .slice(0, slotsAvailable)

    if (newNames.length === 0) {
      return NextResponse.json({ success: true, added: 0, message: 'All profile competitors already exist' })
    }

    // Insert with placeholder data first
    const toInsert = newNames.map(name => ({
      company_id: user.id,
      name: name.trim(),
      source: 'auto',
      threat_score: 60,
      services: 'מתחרה שזוהה בניתוח עסקי',
      positioning: 'מתחרה ישיר',
      trend: 'stable',
    }))

    const { data: inserted, error } = await supabase.from('competitors').insert(toInsert).select()
    if (error) {
      console.error('[sync-profile-competitors] insert error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Enrich in parallel (max 5 at a time)
    const contextHint = [profile.coreActivity, ...(profile.industryTags || []).slice(0, 2)].filter(Boolean).join(', ')
    const enrichBatch = (inserted || []).slice(0, 5)
    await Promise.all(
      enrichBatch.map(async (comp: any) => {
        try {
          const enriched = await enrichCompetitor(comp.name, contextHint)
          if (!enriched) return
          const update: Record<string, any> = {
            threat_score: enriched.threat_score,
            positioning: enriched.positioning,
            trend: enriched.trend,
          }
          if (enriched.services) update.services = enriched.services
          if (enriched.website) update.website = enriched.website
          await supabase.from('competitors').update(update).eq('id', comp.id)
        } catch { /* keep placeholder data */ }
      })
    )

    console.log(`[sync-profile-competitors] added ${inserted?.length || 0} competitors for user ${user.id}`)
    return NextResponse.json({ success: true, added: inserted?.length || 0 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
