export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'
import type { BusinessProfile } from '@/types/business-profile'

const CACHE_MS = 12 * 60 * 60 * 1000 // 12 hours

function extractJSON(text: string): any {
  const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
  try { return JSON.parse(clean) } catch {}
  const s = clean.indexOf('{')
  const e = clean.lastIndexOf('}')
  if (s === -1 || e <= s) return null
  try { return JSON.parse(clean.slice(s, e + 1)) } catch { return null }
}

function buildSearchQuery(bp: BusinessProfile | null, company: any): string {
  const year = new Date().getFullYear()
  if (!bp) {
    const base = company?.industry || company?.description || 'עסקים'
    return `${base} טרנד ${year} ישראל`
  }

  // Build a rich, specific query
  const parts: string[] = []
  if (bp.coreActivity) parts.push(bp.coreActivity.split(/\s+/).slice(0, 5).join(' '))
  if (bp.industryTags?.length) parts.push(bp.industryTags[0])
  if ((bp.products as any)?.[0]?.name) parts.push((bp.products as any)[0].name)
  const markets = bp.geographicMarkets?.includes('ישראל') ? 'ישראל' : bp.geographicMarkets?.[0] || 'ישראל'

  const base = parts.filter(Boolean).join(' ')
  return `${base} טרנד ${year} ${markets}`
}

export async function POST(request: Request) {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const force = new URL(request.url).searchParams.get('force') === 'true'
    if (!force) {
      const { data: co } = await ctx.supabase
        .from('companies').select('industry_trends').eq('id', ctx.user.id).single()
      const cached = (co as any)?.industry_trends as { fetchedAt?: string } | null
      if (cached?.fetchedAt) {
        const age = Date.now() - new Date(cached.fetchedAt).getTime()
        if (age < CACHE_MS) return NextResponse.json({ success: true, ...cached, cached: true })
      }
    }

    const bp = (ctx.company?.business_profile ?? null) as BusinessProfile | null
    const searchQuery = buildSearchQuery(bp, ctx.company)
    const today = new Date().toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })

    const businessContext = bp ? `
תחום ספציפי: ${bp.coreActivity || ''}
מוצרים/שירותים: ${(bp.products as any)?.map((p: any) => p.name).join(', ') || ''}
קהל יעד: ${bp.targetAudiences?.join(', ') || ''}
מתחרים ישירים: ${bp.directCompetitors?.slice(0, 3).join(', ') || ''}
שווקים: ${bp.geographicMarkets?.join(', ') || ''}` : ''

    const prompt = `אתה מנתח שוק ישראלי. חפש ברשת מה טורנד כרגע בתחום: "${searchQuery}"
${businessContext}

תאריך היום: ${today}
חפש מידע מה-7 ימים האחרונים (מאז ${weekAgo}).
חפש גם בישראל וגם בחו"ל.

הוראות:
- מצא עד 8 טרנדים ספציפיים עם עובדות אמיתיות
- לכל טרנד — ציין ראיה ספציפית (סטטיסטיקה, ציטוט, מאמר) שמצאת בחיפוש
- ציין את המקור (שם אתר, פלטפורמה) לכל ראיה
- week_data: 4 מספרים 0-100 המייצגים מגמה שבועית (למשל [40,55,70,85] לטרנד עולה)
- region: "ישראל" לטרנד ישראלי, "עולם" לטרנד בינלאומי

החזר JSON בלבד:
{
  "trends": [
    {
      "name": "שם הטרנד — 3-5 מילים",
      "direction": "rising",
      "evidence": "עובדה ספציפית שמצאת, למשל: גידול של 40% בחיפושים",
      "source": "שם האתר/מקור",
      "week_data": [50, 60, 70, 80],
      "confidence": 75,
      "region": "ישראל"
    }
  ],
  "date_range": "${weekAgo} — ${today}",
  "search_query": "${searchQuery}"
}

CRITICAL: Output ONLY a raw JSON object. No markdown. Start with { and end with }`

    const res = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'grok-4-fast-non-reasoning',
        input: [{ role: 'user', content: prompt }],
        tools: [{ type: 'web_search' }],
      }),
    })

    const raw = await res.json()
    if (!res.ok || !raw.output) {
      return NextResponse.json({ error: 'xAI API error' }, { status: 500 })
    }

    const text = raw.output
      .filter((i: any) => i.type === 'message')
      .flatMap((i: any) => i.content)
      .filter((c: any) => c.type === 'output_text')
      .map((c: any) => c.text)
      .join('')

    const parsed = extractJSON(text)
    if (!parsed?.trends) {
      return NextResponse.json({ success: true, trends: [], date_range: today, search_query: searchQuery, fetchedAt: new Date().toISOString() })
    }

    // Normalize trends
    const trends = (Array.isArray(parsed.trends) ? parsed.trends : [])
      .slice(0, 8)
      .map((t: any) => ({
        name: String(t.name || ''),
        direction: ['rising', 'stable', 'declining'].includes(t.direction) ? t.direction : 'stable',
        evidence: String(t.evidence || ''),
        source: String(t.source || ''),
        week_data: Array.isArray(t.week_data) ? t.week_data.slice(0, 4).map(Number) : [50, 50, 50, 50],
        confidence: typeof t.confidence === 'number' ? Math.min(100, Math.max(0, t.confidence)) : 70,
        region: t.region === 'עולם' ? 'עולם' : 'ישראל',
      }))

    const result = {
      trends,
      date_range: parsed.date_range || today,
      search_query: parsed.search_query || searchQuery,
      fetchedAt: new Date().toISOString(),
    }

    // Save to DB — graceful if column missing
    try {
      await ctx.supabase.from('companies').update({ industry_trends: result } as any).eq('id', ctx.user.id)
    } catch {}

    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
