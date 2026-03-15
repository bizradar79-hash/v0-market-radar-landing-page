import { getFullContext } from '@/lib/context'
import { analyzeWithAI } from '@/lib/ai'
import { NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST() {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const today = new Date().toISOString().split('T')[0]

    const [
      { data: competitors },
      { data: tenders },
      { data: trends },
      { data: news },
      { data: conferences },
    ] = await Promise.all([
      ctx.supabase.from('competitors').select('name, threat_score').order('threat_score', { ascending: false }).limit(10),
      ctx.supabase.from('tenders').select('title, organization, deadline').order('deadline', { ascending: true }).limit(10),
      ctx.supabase.from('trends').select('name, direction').order('created_at', { ascending: false }).limit(5),
      ctx.supabase.from('news').select('title, source').order('published_at', { ascending: false }).limit(5),
      ctx.supabase.from('conferences').select('name, date, location').gte('date', today).order('date', { ascending: true }).limit(5),
    ])

    const highThreatCount = (competitors || []).filter(c => (c.threat_score || 0) >= 70).length
    const topTrend = trends?.[0]
    const topNews = news?.[0]
    const nextConf = conferences?.[0]
    const tendersCount = (tenders || []).length

    const highlights = await analyzeWithAI(`כתוב משפט סיכום אחד בעברית לכל מודול (10-20 מילים, ישיר ותמציתי).

נתונים:
- מתחרים: ${competitors?.length || 0} סה"כ, ${highThreatCount} בעלי ציון איום >= 70
- טרנד מוביל: "${topTrend?.name || 'לא נמצא'}" (מומנטום: ${topTrend?.direction || 'לא ידוע'})
- חדשה ראשונה: "${topNews?.title || 'לא נמצאה'}"
- כנס קרוב: ${nextConf ? `"${nextConf.name}" בתאריך ${nextConf.date} ב${nextConf.location}` : 'לא נמצאו כנסים קרובים'}
- מכרזים פתוחים: ${tendersCount}

החזר JSON בלבד:
{
  "competitors": "...",
  "trends": "...",
  "news": "...",
  "conferences": "...",
  "tenders": "..."
}`)

    return NextResponse.json({ success: true, highlights: highlights || {} })
  } catch (error: any) {
    console.error('Error generating report highlights:', error)
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 })
  }
}
