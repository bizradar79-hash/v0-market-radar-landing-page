import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const REFRESH_CACHE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export async function POST() {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: opportunities, error: fetchError } = await ctx.supabase
      .from('ai_opportunities')
      .select('*')
      .eq('company_id', ctx.user.id)
      .neq('status', 'נסגר')

    if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
    if (!opportunities || opportunities.length === 0) {
      return NextResponse.json({ success: true, skipped: true, reason: 'no opportunities' })
    }

    // Cache check: skip if any opportunity was updated within the last 7 days
    const mostRecentUpdate = opportunities.reduce((latest: string, o: any) => {
      return o.last_ai_update > latest ? o.last_ai_update : latest
    }, opportunities[0].last_ai_update)

    const age = Date.now() - new Date(mostRecentUpdate).getTime()
    if (age < REFRESH_CACHE_MS) {
      console.log('[ai-opportunities/refresh] cache hit, age:', Math.round(age / 3600000), 'h')
      return NextResponse.json({ success: true, skipped: true, reason: 'cache hit' })
    }

    const company = ctx.company
    const profile = ctx.companyProfile || ''
    const now = new Date().toISOString()

    // Re-evaluate each opportunity with Grok (no web_search needed)
    const prompt = `אתה יועץ עסקי ישראלי. עדכן את ציוני ההזדמנויות הבאות בהתבסס על הפרופיל העסקי.

פרופיל עסק:
${profile}
תחום: ${company?.industry || ''} | עיר: ${company?.city || ''}

הזדמנויות לעדכון:
${opportunities.map((o: any, i: number) => `${i + 1}. [${o.id}] "${o.title}" | מקור: ${o.source_type} | ציון נוכחי: ${o.revenue_potential_score}`).join('\n')}

עבור כל הזדמנות, העריך מחדש:
- revenue_potential_score (0–100): פוטנציאל הכנסה כולל
- market_demand_score (0–100): עוצמת הביקוש בשוק
- competition_score (0–100): עוצמת התחרות (גבוה = תחרות רבה)
- estimated_revenue_min (₪, מספר שלם, מכפלת 500)
- estimated_revenue_max (₪, מספר שלם, מכפלת 500)

החזר JSON בלבד — מערך של אובייקטים:
[{"id":"...","revenue_potential_score":75,"market_demand_score":70,"competition_score":45,"estimated_revenue_min":5000,"estimated_revenue_max":15000}]

CRITICAL: Output ONLY a raw JSON array. No markdown.`

    const response = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'grok-4-fast-non-reasoning',
        input: [{ role: 'user', content: prompt }],
        // No web_search — pure re-evaluation
      }),
    })

    const data = await response.json()
    if (!response.ok || !data.output) {
      return NextResponse.json({ error: 'Grok API error', detail: data }, { status: 500 })
    }

    const text = data.output
      .filter((item: any) => item.type === 'message')
      .flatMap((item: any) => item.content)
      .filter((c: any) => c.type === 'output_text')
      .map((c: any) => c.text)
      .join('')

    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    const start = clean.indexOf('[')
    const end = clean.lastIndexOf(']')
    if (start === -1 || end <= start) {
      console.error('[ai-opportunities/refresh] No JSON array in response')
      return NextResponse.json({ success: false, error: 'No JSON array in Grok response' })
    }

    let updates: any[] = []
    try {
      updates = JSON.parse(clean.slice(start, end + 1))
    } catch {
      return NextResponse.json({ success: false, error: 'JSON parse failed' })
    }

    // Apply updates to DB
    const patchPromises = updates.map(async (u: any) => {
      const original = opportunities.find((o: any) => o.id === u.id)
      if (!original) return

      const newScore = Math.min(100, Math.max(0, u.revenue_potential_score || 0))
      const scoreDelta = newScore - (original.revenue_potential_score || 0)
      const heatStatus =
        scoreDelta > 8  ? 'heating' :
        scoreDelta < -8 ? 'cooling' : null

      await ctx.supabase
        .from('ai_opportunities')
        .update({
          revenue_potential_score: newScore,
          market_demand_score: Math.min(100, Math.max(0, u.market_demand_score || 0)),
          competition_score: Math.min(100, Math.max(0, u.competition_score || 0)),
          estimated_revenue_min: Math.max(0, u.estimated_revenue_min || 0),
          estimated_revenue_max: Math.max(0, u.estimated_revenue_max || 0),
          previous_revenue_score: original.revenue_potential_score,
          score_change: scoreDelta,
          heat_status: heatStatus,
          last_ai_update: now,
        })
        .eq('id', u.id)
        .eq('company_id', ctx.user.id)
    })

    await Promise.all(patchPromises)

    return NextResponse.json({ success: true, updated: updates.length })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
