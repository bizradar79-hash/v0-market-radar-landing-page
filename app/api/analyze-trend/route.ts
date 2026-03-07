import { createClient } from '@/lib/supabase/server'
import { analyzeWithAI } from '@/lib/ai'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { trendData, companyContext } = await request.json()

    if (!trendData || !Array.isArray(trendData)) {
      return NextResponse.json(
        { success: false, error: 'נדרש מידע על טרנדים' },
        { status: 400 }
      )
    }

    const output = await analyzeWithAI(`נתח את הטרנדים הבאים וספק תובנות אסטרטגיות לשוק הישראלי.

נתוני טרנדים:
${JSON.stringify(trendData, null, 2)}

${companyContext ? `הקשר עסקי:\n${JSON.stringify(companyContext, null, 2)}` : ''}

החזר JSON בפורמט זה בלבד:
{
  "summary": "סיכום כללי של הטרנד",
  "direction": "עולה",
  "strength": 75,
  "timeframe": "6-12 חודשים",
  "impact": {
    "opportunities": ["הזדמנות 1", "הזדמנות 2"],
    "threats": ["איום 1", "איום 2"],
    "neutrals": ["השפעה ניטרלית 1"]
  },
  "recommendations": [
    { "action": "פעולה מומלצת", "priority": "גבוהה", "timeline": "תוך חודש" }
  ],
  "relatedTrends": ["טרנד קשור 1", "טרנד קשור 2"],
  "confidence": 80
}`)

    const supabase = createClient()
    for (const trend of trendData) {
      if (trend.id) {
        await supabase
          .from('trends')
          .update({
            score: output.strength,
            direction: output.direction,
            description: output.summary,
          })
          .eq('id', trend.id)
      }
    }

    return NextResponse.json({
      success: true,
      analysis: output,
      analyzedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Error analyzing trend:', error)
    return NextResponse.json(
      { success: false, error: 'שגיאה בניתוח הטרנד' },
      { status: 500 }
    )
  }
}
