export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'

interface ReportSection {
  title: string
  content: string[]
  meta?: string
}

interface WeeklyReport {
  generated_at: string
  company_name: string
  sections: ReportSection[]
}

export async function POST(request: Request) {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const [
      { data: competitors },
      { data: tenders },
      { data: news },
      { data: company },
    ] = await Promise.all([
      ctx.supabase.from('competitors').select('name, threat_score, services, positioning').order('threat_score', { ascending: false }).limit(10),
      ctx.supabase.from('tenders').select('title, organization, deadline, description').order('deadline', { ascending: true }).limit(5),
      ctx.supabase.from('news').select('title, source, summary, category, published_at').gte('published_at', weekAgo).order('published_at', { ascending: false }).limit(8),
      ctx.supabase.from('companies').select('name, industry, business_overview, seo_ranking, geo_ranking, industry_trends, competitor_trends, weekly_actions, niche_opportunities').eq('id', ctx.user.id).single(),
    ])

    const sections: ReportSection[] = []

    // 1. Business Overview
    if (company?.business_overview) {
      sections.push({
        title: "סקירת עסק",
        content: [company.business_overview],
        meta: company.industry || '',
      })
    }

    // 2. Competitors
    if (competitors && competitors.length > 0) {
      const high = competitors.filter(c => (c.threat_score || 0) >= 70)
      sections.push({
        title: "עדכון מתחרים",
        content: [
          `נמצאו ${competitors.length} מתחרים סה"כ — ${high.length} בעלי ציון איום גבוה (≥70).`,
          ...competitors.slice(0, 5).map(c => `• ${c.name} — ציון איום: ${c.threat_score || 'לא ידוע'}`),
        ],
        meta: `${competitors.length} מתחרים`,
      })
    }

    // 3. SEO Summary
    const seoData = (company as any)?.seo_ranking as any
    if (seoData?.queryVariants) {
      const appeared = seoData.queryVariants.filter((v: any) => v.appeared && v.position != null)
      const best = appeared.reduce((b: any, v: any) => (!b || v.position < b.position) ? v : b, null)
      sections.push({
        title: "דירוג SEO",
        content: [
          best ? `הדירוג הטוב ביותר: מיקום #${best.position} עבור "${best.query}"` : 'לא נמצא מיקום בגוגל השבוע',
          `נבדקו ${seoData.queryVariants.length} שאילתות — הופעה ב-${appeared.length} מהן`,
        ],
        meta: best ? `#${best.position}` : '—',
      })
    }

    // 4. GEO Summary
    const geoData = (company as any)?.geo_ranking as any
    if (geoData?.engines) {
      const engineLines = Object.entries(geoData.engines).map(([eng, data]: [string, any]) => {
        const label = { general: 'כללי', chatgpt: 'ChatGPT', gemini: 'Gemini', grok: 'Grok' }[eng] || eng
        return data?.appeared ? `• ${label}: מיקום #${data.position}` : `• ${label}: לא הוזכרת`
      })
      sections.push({
        title: "דירוג GEO (מנועי AI)",
        content: engineLines,
        meta: Object.values(geoData.engines as any).filter((d: any) => d?.appeared).length + '/4 מנועים',
      })
    }

    // 5. Trending Topics
    const industryTrends = (company as any)?.industry_trends as any
    if (industryTrends?.trends?.length) {
      const rising = industryTrends.trends.filter((t: any) => t.direction === 'rising').slice(0, 3)
      sections.push({
        title: "טרנדים חמים השבוע",
        content: [
          ...rising.map((t: any) => `📈 ${t.name}: ${t.evidence || ''}`),
          ...industryTrends.trends.filter((t: any) => t.direction === 'declining').slice(0, 2).map((t: any) => `📉 ${t.name}`),
        ].filter(Boolean),
        meta: `${industryTrends.trends.length} טרנדים`,
      })
    }

    // 6. News
    if (news && news.length > 0) {
      sections.push({
        title: "חדשות רלוונטיות השבוע",
        content: news.map(n => `• [${n.category}] ${n.title} (${n.source})`),
        meta: `${news.length} חדשות`,
      })
    }

    // 7. Tenders
    if (tenders && tenders.length > 0) {
      sections.push({
        title: "מכרזים פעילים",
        content: tenders.map(t => `• ${t.title} — ${t.organization} (עד ${new Date(t.deadline).toLocaleDateString('he-IL')})`),
        meta: `${tenders.length} מכרזים`,
      })
    }

    // 8. Weekly Actions
    const weeklyActions = (company as any)?.weekly_actions as any
    if (Array.isArray(weeklyActions) && weeklyActions.length > 0) {
      sections.push({
        title: "משימות שבועיות",
        content: weeklyActions.slice(0, 5).map((a: any) => `• ${a.title || a.action || a}`),
        meta: `${weeklyActions.length} משימות`,
      })
    }

    // 9. Niche Opportunities
    const nicheOpps = (company as any)?.niche_opportunities as any
    const activeNiches = Array.isArray(nicheOpps)
      ? nicheOpps.filter((n: any) => n.status === 'tracking').slice(0, 3)
      : []
    if (activeNiches.length > 0) {
      sections.push({
        title: "הזדמנויות נישה במעקב",
        content: activeNiches.map((n: any) => `• ${n.nicheTitle}: ${n.shortInsightSummary || ''}`),
        meta: `${activeNiches.length} במעקב`,
      })
    }

    const report: WeeklyReport = {
      generated_at: new Date().toISOString(),
      company_name: company?.name || '',
      sections,
    }

    // Save to DB
    await ctx.supabase.from('companies').update({ last_report: report } as any).eq('id', ctx.user.id)

    return NextResponse.json({ success: true, report })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
