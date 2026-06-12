export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { getFullContext } from '@/lib/context'
import { ScanCostCollector } from '@/lib/scan/cost-tracker'
import { NextResponse } from 'next/server'

const CACHE_MS = 12 * 60 * 60 * 1000 // 12 hours

function extractJSON(text: string): any {
  const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
  try { return JSON.parse(clean) } catch {}
  const s = clean.indexOf('{')
  const e = clean.lastIndexOf('}')
  if (s === -1 || e <= s) return null
  try { return JSON.parse(clean.slice(s, e + 1)) } catch { return null }
}

async function analyzeCompetitor(
  competitorName: string,
  competitorWebsite: string,
  companyIndustry: string,
  companyActivity: string,
  cost: ScanCostCollector,
): Promise<{ trending_topics: string[]; new_activity: string; opportunity: string } | null> {
  const siteHint = competitorWebsite ? ` (אתר: ${competitorWebsite})` : ''
  const today = new Date().toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })

  const prompt = `חפש ברשת מה עושה המתחרה "${competitorName}"${siteHint} לאחרונה (ב-30 הימים האחרונים).

תאריך היום: ${today}
תחום הענף: ${companyActivity || companyIndustry}

חפש:
1. אילו נושאים/מילות מפתח הם מקדמים בתוכן ובפרסום
2. מוצרים חדשים, קמפיינים, שינויים באתר, פרסומים חדשים
3. איזו הזדמנות זה יוצר עבור מתחרה שלא עסוק בנושא הזה עדיין

החזר JSON בלבד:
{
  "trending_topics": ["נושא 1", "נושא 2", "נושא 3"],
  "new_activity": "תיאור קצר של פעילות חדשה שמצאת, או null אם לא נמצא",
  "opportunity": "מה אפשר לעשות כדי לנצל את הפער שהמתחרה יצר"
}

CRITICAL: Output ONLY a raw JSON object. No markdown. Start with { and end with }`

  const t0 = Date.now()
  try {
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
    cost.add({ provider: 'xai', model: 'grok-4-fast-non-reasoning', webSearch: true, data: raw, ms: Date.now() - t0 })
    if (!res.ok || !raw.output) return null

    const text = raw.output
      .filter((i: any) => i.type === 'message')
      .flatMap((i: any) => i.content)
      .filter((c: any) => c.type === 'output_text')
      .map((c: any) => c.text)
      .join('')

    const parsed = extractJSON(text)
    if (!parsed) return null

    return {
      trending_topics: Array.isArray(parsed.trending_topics)
        ? parsed.trending_topics.slice(0, 4).map(String)
        : [],
      new_activity: parsed.new_activity ? String(parsed.new_activity) : '',
      opportunity: parsed.opportunity ? String(parsed.opportunity) : '',
    }
  } catch {
    cost.add({ provider: 'xai', model: 'grok-4-fast-non-reasoning', webSearch: true, ms: Date.now() - t0 })
    return null
  }
}

export async function POST(request: Request) {
  let cost: ScanCostCollector | null = null
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    cost = new ScanCostCollector(ctx.user.id, 'competitor_trends')

    const force = new URL(request.url).searchParams.get('force') === 'true'
    if (!force) {
      const { data: co } = await ctx.supabase
        .from('companies').select('competitor_trends').eq('id', ctx.user.id).single()
      const cached = (co as any)?.competitor_trends as { fetchedAt?: string } | null
      if (cached?.fetchedAt) {
        const age = Date.now() - new Date(cached.fetchedAt).getTime()
        if (age < CACHE_MS) { await cost.flush(); return NextResponse.json({ success: true, ...cached, cached: true }) }
      }
    }

    const competitors: any[] = ctx.competitors || []
    if (competitors.length === 0) {
      await cost.flush()
      return NextResponse.json({
        success: true,
        competitor_data: [],
        fetchedAt: new Date().toISOString(),
      })
    }

    const companyActivity = (ctx.company?.business_profile as any)?.coreActivity || ctx.company?.description || ''
    const companyIndustry = ctx.company?.industry || ''

    // Analyze up to 5 competitors in parallel
    const top5 = competitors.slice(0, 5)
    const results = await Promise.all(
      top5.map(async (c) => {
        const analysis = await analyzeCompetitor(c.name, c.website || '', companyIndustry, companyActivity, cost!)
        return {
          competitor_name: c.name,
          competitor_website: c.website || '',
          trending_topics: analysis?.trending_topics ?? [],
          new_activity: analysis?.new_activity ?? '',
          opportunity: analysis?.opportunity ?? '',
          has_opportunity: !!(analysis?.opportunity && analysis.opportunity.length > 10),
        }
      })
    )

    // Filter out competitors where we got no data
    const competitor_data = results.filter(r => r.trending_topics.length > 0 || r.new_activity)

    const result = {
      competitor_data,
      fetchedAt: new Date().toISOString(),
    }

    try {
      await ctx.supabase.from('companies').update({ competitor_trends: result } as any).eq('id', ctx.user.id)
    } catch {}

    await cost.flush()
    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    await cost?.flush()
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
