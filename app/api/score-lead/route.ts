import { generateText, Output } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const leadScoreSchema = z.object({
  score: z.number().min(1).max(100).describe('ציון הליד מ-1 עד 100'),
  reasoning: z.string().describe('נימוק מפורט לציון בעברית'),
  recommendedOutreach: z.string().describe('אסטרטגיית פנייה מומלצת בעברית'),
  urgency: z.enum(['גבוהה', 'בינונית', 'נמוכה']).describe('רמת הדחיפות'),
  potentialValue: z.string().describe('הערכת שווי פוטנציאלי'),
  nextSteps: z.array(z.string()).describe('צעדים הבאים מומלצים'),
})

export async function POST(request: Request) {
  try {
    const { company, signals } = await request.json()

    if (!company) {
      return NextResponse.json(
        { success: false, error: 'נדרש מידע על החברה' },
        { status: 400 }
      )
    }

    const { output } = await generateText({
      model: 'anthropic/claude-sonnet-4-20250514',
      output: Output.object({
        schema: leadScoreSchema,
      }),
      messages: [
        {
          role: 'system',
          content: `אתה מומחה לניקוד לידים ומכירות B2B בשוק הישראלי.
תפקידך להעריך לידים פוטנציאליים ולדרג אותם לפי סבירות להמרה.
התחשב בגודל החברה, תעשייה, סיגנלי קנייה, ותזמון.
כל התשובות שלך חייבות להיות בעברית מלאה ומקצועית.`,
        },
        {
          role: 'user',
          content: `הערך את הליד הבא ותן ציון:

פרטי החברה:
${JSON.stringify(company, null, 2)}

סיגנלים שזוהו:
${JSON.stringify(signals || [], null, 2)}

אנא ספק:
- ציון כולל (1-100)
- נימוק מפורט לציון
- אסטרטגיית פנייה מומלצת
- רמת דחיפות
- הערכת שווי פוטנציאלי
- צעדים הבאים מומלצים`,
        },
      ],
    })

    if (!output) {
      return NextResponse.json(
        { success: false, error: 'לא התקבלה תשובה מהמודל' },
        { status: 500 }
      )
    }

    // Update lead in Supabase if company has an ID
    if (company.id) {
      const supabase = await createClient()
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
