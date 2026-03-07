import { createClient } from '@/lib/supabase/server'
import { analyzeWithAI } from '@/lib/ai'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { signals, companyProfile } = await request.json()

    if (!signals || !Array.isArray(signals)) {
      return NextResponse.json(
        { success: false, error: 'נדרש מערך של סיגנלים' },
        { status: 400 }
      )
    }

    const output = await analyzeWithAI(`נתח את הסיגנלים הבאים וזהה הזדמנות עסקית לחברה.

פרופיל החברה:
${JSON.stringify(companyProfile, null, 2)}

סיגנלים שזוהו:
${JSON.stringify(signals, null, 2)}

החזר JSON בפורמט זה בלבד:
{
  "title": "כותרת ההזדמנות בעברית",
  "description": "תיאור מפורט של ההזדמנות",
  "impactScore": 85,
  "confidenceScore": 80,
  "priority": "גבוהה",
  "recommendedActions": ["פעולה 1", "פעולה 2", "פעולה 3"],
  "type": "סוג ההזדמנות"
}`)

    const supabase = await createClient()
    const { data, error: dbError } = await supabase
      .from('opportunities')
      .insert({
        title: output.title,
        description: output.description,
        impact_score: output.impactScore,
        confidence_score: output.confidenceScore,
        priority: output.priority,
        recommended_actions: output.recommendedActions,
        type: output.type,
        source: 'AI Analysis',
        category: output.type,
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
    }

    return NextResponse.json({
      success: true,
      opportunity: output,
      saved: !dbError,
      id: data?.id,
    })
  } catch (error) {
    console.error('Error analyzing opportunity:', error)
    return NextResponse.json(
      { success: false, error: 'שגיאה בניתוח ההזדמנות' },
      { status: 500 }
    )
  }
}
