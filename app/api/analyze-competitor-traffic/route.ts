import { getFullContext } from '@/lib/context'
import { analyzeWithAI } from '@/lib/ai'
import { multiSearch } from '@/lib/search'
import { NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { competitorName, competitorWebsite } = await req.json()
    if (!competitorName) return NextResponse.json({ error: 'Missing competitorName' }, { status: 400 })

    let domain = ''
    try { domain = new URL(competitorWebsite || '').hostname.replace(/^www\./, '') } catch {}

    const results = await multiSearch([
      `"${competitorName}" website traffic monthly visitors statistics`,
      `${domain || competitorName} similarweb traffic ranking 2025`,
      `${competitorName} site visitors alexa rank`,
    ])

    const data = await analyzeWithAI(`נתח את נתוני התנועה לאתר "${competitorName}"${domain ? ` (${domain})` : ''} מהמידע הבא:

${results.map(r => `[${r.title}] ${r.url} - ${r.content}`).join('\n')}

החזר JSON עם הערכות תנועה בלבד. אם נתון לא ידוע, השתמש null:

{
  "monthly_visits": "250K",
  "organic_pct": 70,
  "paid_pct": 15,
  "direct_pct": 15,
  "top_countries": ["ישראל", "ארה\"ב"],
  "mobile_pct": 58,
  "desktop_pct": 42,
  "bounce_rate": "45%",
  "avg_duration": "2:30",
  "global_rank": "125,000",
  "data_quality": "estimated"
}`)

    return NextResponse.json({ success: true, traffic: data })
  } catch (e: any) {
    console.error('analyze-competitor-traffic error:', e?.message)
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
