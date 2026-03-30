export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const companyName = ctx.company?.name || ''
    const overview = ctx.company?.business_overview || ctx.company?.description || ''
    const bp = (ctx.company?.business_profile as any) ?? null

    const context = [
      overview,
      bp?.coreActivity ? `פעילות מרכזית: ${bp.coreActivity}` : '',
      bp?.products?.length ? `מוצרים/שירותים: ${bp.products.map((p: any) => p.name).join(', ')}` : '',
      bp?.targetAudiences?.length ? `קהל יעד: ${bp.targetAudiences.join(', ')}` : '',
    ].filter(Boolean).join('\n')

    const prompt = `בהתבסס על המידע הבא על העסק "${companyName}", זהה את ערוצי ההפצה הפעילים והפוטנציאליים של העסק.

מידע על העסק:
${context}

החזר JSON בלבד — מערך של מחרוזות בעברית:
{"channels": ["ערוץ 1", "ערוץ 2", "ערוץ 3"]}

דוגמאות לערוצים: מכירה ישירה, אתר אינטרנט, רשתות חברתיות, מפיצים, שותפים עסקיים, חנויות, B2B פגישות, קטלוגים, פלטפורמות מקוונות
החזר רק ערוצים רלוונטיים לעסק זה — בין 3 ל-8 ערוצים.
CRITICAL: Output ONLY raw JSON. No markdown. Start with { end with }`

    const response = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.XAI_API_KEY}` },
      body: JSON.stringify({
        model: 'grok-4-fast-non-reasoning',
        input: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await response.json()
    if (!response.ok || !data.output) return NextResponse.json({ channels: [] })

    const text = data.output
      .filter((i: any) => i.type === 'message')
      .flatMap((i: any) => i.content)
      .filter((c: any) => c.type === 'output_text')
      .map((c: any) => c.text)
      .join('')

    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    const s = clean.indexOf('{'); const e = clean.lastIndexOf('}')
    if (s === -1 || e <= s) return NextResponse.json({ channels: [] })

    let parsed: any = {}
    try { parsed = JSON.parse(clean.slice(s, e + 1)) } catch { return NextResponse.json({ channels: [] }) }

    const channels: string[] = Array.isArray(parsed.channels) ? parsed.channels.slice(0, 10) : []

    // Save to DB
    await ctx.supabase.from('companies').update({ distribution_channels: channels } as any).eq('id', ctx.user.id)

    return NextResponse.json({ channels })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
