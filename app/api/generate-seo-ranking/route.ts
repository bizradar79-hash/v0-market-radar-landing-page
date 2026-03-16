import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST() {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const companyName = ctx.company?.name || ''
    const website = ctx.company?.website || ''
    const city = ctx.company?.city || 'ישראל'
    const industry = ctx.companyProfile?.industry || ''
    const primaryKeywords = ctx.companyProfile?.primaryKeywords || ''

    const searchQuery = [industry, city, primaryKeywords].filter(Boolean).join(' ')

    const prompt = `אתה מומחה SEO ישראלי. חפש בגוגל את השאילתה הבאה ורשום את 10 התוצאות האורגניות הראשונות בדיוק לפי הסדר שבו הן מופיעות:

שאילתת חיפוש: "${searchQuery}"

פרטי העסק שלנו:
- שם: ${companyName}
- אתר: ${website}

לכל תוצאה ציין:
- position: מיקום (1-10)
- name: שם העסק או הדף
- url: כתובת ה-URL המלאה
- title: כותרת הדף כפי שמופיעה בגוגל
- isOwn: true רק אם זה האתר ${website} שלנו, אחרת false

אחרי הרשימה תן 3 המלצות ספציפיות ומעשיות לשיפור דירוג SEO של ${companyName} בהתבסס על התוצאות שמצאת.

החזר JSON בלבד:
{"query": "", "results": [{"position": 1, "name": "", "url": "", "title": "", "isOwn": false}], "recommendations": ["", "", ""]}

CRITICAL: Output ONLY a raw JSON object. No markdown. Start with { and end with }`

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
    if (!response.ok || !data.output) {
      return NextResponse.json({ error: 'xAI API error', detail: data }, { status: 500 })
    }

    const text = data.output
      .filter((item: any) => item.type === 'message')
      .flatMap((item: any) => item.content)
      .filter((c: any) => c.type === 'output_text')
      .map((c: any) => c.text)
      .join('')

    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    const start = clean.indexOf('{')
    const end = clean.lastIndexOf('}')
    if (start === -1 || end <= start) {
      return NextResponse.json({ error: 'Failed to parse response', raw: text.slice(0, 500) }, { status: 500 })
    }

    let parsed: any = {}
    try { parsed = JSON.parse(clean.slice(start, end + 1)) } catch {
      return NextResponse.json({ error: 'JSON parse error', raw: text.slice(0, 500) }, { status: 500 })
    }

    const result = {
      query: parsed.query || searchQuery,
      results: Array.isArray(parsed.results) ? parsed.results.slice(0, 10) : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.slice(0, 3) : [],
      fetchedAt: new Date().toISOString(),
    }

    await ctx.supabase.from('companies').update({ seo_ranking: result }).eq('id', ctx.user.id)

    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
