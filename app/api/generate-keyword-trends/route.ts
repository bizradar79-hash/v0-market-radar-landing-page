import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'

export const maxDuration = 60

async function fetchTrendsForRegion(keyword: string, region: 'israel' | 'world'): Promise<any[]> {
  const geoText = region === 'israel'
    ? `בישראל. חפש מה אנשים מחפשים יותר בגוגל, מה עולה ברשתות חברתיות, מה מדוברים בפורומים ישראליים`
    : `בעולם (לא מוגבל לישראל). חפש מגמות גלובליות בגוגל, רשתות חברתיות, ופורומים בינלאומיים`

  const prompt = `מצא את 5 הנושאים והביטויים שהיו הכי טרנדיים בשבוע האחרון וקשורים למילה: '${keyword}' ${geoText}.

גם תן לכל ביטוי 4 נקודות נתונים שבועיות (ערך 0-100 עוצמה) עבור 4 השבועות האחרונים מהישן לחדש.

החזר JSON בלבד:
[{"phrase": "", "trend": "עולה/יורד/יציב", "reason": "למה זה טרנדי עכשיו", "trend_data": [{"week": "W1", "value": 40}, {"week": "W2", "value": 55}, {"week": "W3", "value": 70}, {"week": "W4", "value": 85}]}]

CRITICAL: Output ONLY a raw JSON array. No markdown. Start with [ and end with ]`

  const response = await fetch('https://api.x.ai/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'grok-4-fast-non-reasoning',
      input: [{ role: 'user', content: prompt }],
      tools: [{ type: 'web_search' }],
    }),
  })

  const data = await response.json()
  if (!response.ok || !data.output) return []

  const text = data.output
    .filter((item: any) => item.type === 'message')
    .flatMap((item: any) => item.content)
    .filter((c: any) => c.type === 'output_text')
    .map((c: any) => c.text)
    .join('')

  const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
  const start = clean.indexOf('[')
  const end = clean.lastIndexOf(']')
  if (start === -1 || end <= start) return []

  try {
    const list = JSON.parse(clean.slice(start, end + 1))
    return Array.isArray(list) ? list.slice(0, 5) : []
  } catch {
    return []
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { keyword } = await request.json()
    if (!keyword) return NextResponse.json({ error: 'Missing keyword' }, { status: 400 })

    // Run Israel and World searches in parallel
    const [israelTrends, worldTrends] = await Promise.all([
      fetchTrendsForRegion(keyword, 'israel'),
      fetchTrendsForRegion(keyword, 'world'),
    ])

    // Merge with existing keyword_trends in companies table
    const { data: company } = await ctx.supabase
      .from('companies').select('keyword_trends').eq('id', ctx.user.id).single()

    const existing = (company?.keyword_trends && typeof company.keyword_trends === 'object')
      ? company.keyword_trends
      : {}

    const updated = {
      ...existing,
      [keyword]: {
        fetchedAt: new Date().toISOString(),
        trends: israelTrends, // backward-compat alias
        israel: israelTrends,
        world: worldTrends,
      },
    }

    const { error: saveError } = await ctx.supabase
      .from('companies').update({ keyword_trends: updated }).eq('id', ctx.user.id)

    if (saveError) {
      console.error('keyword_trends save error:', saveError.code, saveError.message)
      return NextResponse.json({
        success: true, keyword,
        trends: israelTrends, israel: israelTrends, world: worldTrends,
        saveError: saveError.message,
      })
    }

    return NextResponse.json({ success: true, keyword, trends: israelTrends, israel: israelTrends, world: worldTrends })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
