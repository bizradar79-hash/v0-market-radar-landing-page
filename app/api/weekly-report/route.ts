import { generateText } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { companyId } = await request.json()

    const supabase = await createClient()

    // Fetch all relevant data from Supabase
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

    const { text: report } = await generateText({
      model: 'anthropic/claude-sonnet-4-20250514',
      messages: [
        {
          role: 'system',
          content: `אתה אנליסט מודיעין עסקי בכיר המתמחה בשוק הישראלי.
תפקידך להכין דוח מודיעין שבועי מקיף ומקצועי.
הדוח צריך להיות כתוב בעברית מלאה, ברור ומאורגן.
השתמש בפורמט מקצועי עם כותרות, נקודות, והמלצות אקטיביות.`,
        },
        {
          role: 'user',
          content: `הכן דוח מודיעין שבועי מקיף על בסיס הנתונים הבאים:

${company ? `פרטי החברה:\n${JSON.stringify(company, null, 2)}\n\n` : ''}

הזדמנויות שזוהו השבוע (${opportunities?.length || 0}):
${JSON.stringify(opportunities, null, 2)}

פעילות מתחרים (${competitors?.length || 0}):
${JSON.stringify(competitors, null, 2)}

לידים חדשים (${leads?.length || 0}):
${JSON.stringify(leads, null, 2)}

מכרזים פעילים (${tenders?.length || 0}):
${JSON.stringify(tenders, null, 2)}

טרנדים מובילים (${trends?.length || 0}):
${JSON.stringify(trends, null, 2)}

חדשות רלוונטיות (${news?.length || 0}):
${JSON.stringify(news, null, 2)}

התראות ממתינות (${alerts?.length || 0}):
${JSON.stringify(alerts, null, 2)}

אנא הכן דוח מודיעין שבועי הכולל:
1. תקציר מנהלים - הנקודות החשובות ביותר
2. הזדמנויות מובילות - ניתוח ודירוג
3. סקירת מתחרים - שינויים ומגמות
4. לידים מבטיחים - המלצות לפעולה
5. מכרזים דחופים - לוח זמנים וסיכויים
6. ניתוח טרנדים - מגמות שוק
7. סיכום חדשות - השפעות על העסק
8. המלצות אסטרטגיות - צעדים מוצעים לשבוע הקרוב
9. מדדי ביצוע מרכזיים (KPIs)

הדוח צריך להיות מעשי, עם המלצות ספציפיות לפעולה.`,
        },
      ],
      maxOutputTokens: 4000,
    })

    // Save report to a reports table (optional - create if needed)
    const reportData = {
      company_id: companyId,
      report_content: report,
      generated_at: new Date().toISOString(),
      opportunities_count: opportunities?.length || 0,
      leads_count: leads?.length || 0,
      competitors_count: competitors?.length || 0,
      alerts_count: alerts?.length || 0,
    }

    return NextResponse.json({
      success: true,
      report,
      summary: {
        opportunities: opportunities?.length || 0,
        competitors: competitors?.length || 0,
        leads: leads?.length || 0,
        tenders: tenders?.length || 0,
        trends: trends?.length || 0,
        news: news?.length || 0,
        alerts: alerts?.length || 0,
      },
      generatedAt: reportData.generated_at,
    })
  } catch (error) {
    console.error('Error generating weekly report:', error)
    return NextResponse.json(
      { success: false, error: 'שגיאה ביצירת הדוח השבועי' },
      { status: 500 }
    )
  }
}
