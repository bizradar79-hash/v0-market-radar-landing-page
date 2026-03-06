import { analyzeWithAI } from '@/lib/ai'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { companyId } = await request.json()

    const supabase = await createClient()

    const [
      { data: opportunities },
      { data: competitors },
      { data: leads },
      { data: tenders },
      { data: trends },
      { data: news },
      { data: alerts },
      { data: company },
    ] = await Promise.all([
      supabase.from('opportunities').select('*').order('created_at', { ascending: false }).limit(10),
      supabase.from('competitors').select('*').order('detected_at', { ascending: false }).limit(10),
      supabase.from('leads').select('*').order('created_at', { ascending: false }).limit(10),
      supabase.from('tenders').select('*').eq('status', 'פעיל').order('deadline', { ascending: true }).limit(5),
      supabase.from('trends').select('*').order('score', { ascending: false }).limit(5),
      supabase.from('news').select('*').order('published_at', { ascending: false }).limit(10),
      supabase.from('alerts').select('*').eq('is_read', false).order('created_at', { ascending: false }),
      companyId ? supabase.from('companies').select('*').eq('id', companyId).single() : Promise.resolve({ data: null }),
    ])

    const result = await analyzeWithAI(`הכן דוח מודיעין שבועי מקיף על בסיס הנתונים הבאים.

${company ? `פרטי החברה:\n${JSON.stringify(company, null, 2)}\n` : ''}

הזדמנויות (${opportunities?.length || 0}):
${JSON.stringify(opportunities?.slice(0, 5), null, 2)}

מתחרים (${competitors?.length || 0}):
${JSON.stringify(competitors?.slice(0, 5), null, 2)}

לידים (${leads?.length || 0}):
${JSON.stringify(leads?.slice(0, 5), null, 2)}

מכרזים פעילים (${tenders?.length || 0}):
${JSON.stringify(tenders, null, 2)}

טרנדים (${trends?.length || 0}):
${JSON.stringify(trends, null, 2)}

חדשות (${news?.length || 0}):
${JSON.stringify(news?.slice(0, 5), null, 2)}

החזר JSON בפורמט זה בלבד:
{
  "executiveSummary": "תקציר מנהלים - הנקודות החשובות",
  "topOpportunities": ["הזדמנות 1", "הזדמנות 2"],
  "competitorUpdates": "סקירת מתחרים",
  "hotLeads": ["ליד מבטיח 1"],
  "urgentTenders": ["מכרז דחוף 1"],
  "marketTrends": "ניתוח טרנדים",
  "strategicRecommendations": ["המלצה 1", "המלצה 2", "המלצה 3"],
  "weeklyKPIs": {
    "opportunities": ${opportunities?.length || 0},
    "leads": ${leads?.length || 0},
    "competitors": ${competitors?.length || 0},
    "alerts": ${alerts?.length || 0}
  }
}`)

    return NextResponse.json({
      success: true,
      report: result,
      summary: {
        opportunities: opportunities?.length || 0,
        competitors: competitors?.length || 0,
        leads: leads?.length || 0,
        tenders: tenders?.length || 0,
        trends: trends?.length || 0,
        news: news?.length || 0,
        alerts: alerts?.length || 0,
      },
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Error generating weekly report:', error)
    return NextResponse.json(
      { success: false, error: 'שגיאה ביצירת הדוח השבועי' },
      { status: 500 }
    )
  }
}
