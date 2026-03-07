import { createClient } from '@/lib/supabase/server'
import { analyzeWithAI } from '@/lib/ai'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { company, signals } = await request.json()

    if (!company) {
      return NextResponse.json(
        { success: false, error: 'נדרש מידע על החברה' },
        { status: 400 }
      )
    }

    const output = await analyzeWithAI(`הערך את הליד הבא ותן ציון לפי סבירות המרה בשוק הישראלי.

פרטי החברה:
${JSON.stringify(company, null, 2)}

סיגנלים שזוהו:
${JSON.stringify(signals || [], null, 2)}

החזר JSON בפורמט זה בלבד:
{
  "score": 78,
  "reasoning": "נימוק מפורט לציון",
  "recommendedOutreach": "אסטרטגיית פנייה מומלצת",
  "urgency": "בינונית",
  "potentialValue": "₪50,000-100,000 לשנה",
  "nextSteps": ["צעד 1", "צעד 2", "צעד 3"]
}`)

    if (company.id) {
      const supabase = createClient()
      await supabase
        .from('leads')
        .update({
          score: output.score,
          discovery_reason: output.reasoning,
          updated_at: new Date().toISOString(),
        })
        .eq('id', company.id)
    }

    return NextResponse.json({
      success: true,
      leadScore: output,
    })
  } catch (error) {
    console.error('Error scoring lead:', error)
    return NextResponse.json(
      { success: false, error: 'שגיאה בניקוד הליד' },
      { status: 500 }
    )
  }
}
