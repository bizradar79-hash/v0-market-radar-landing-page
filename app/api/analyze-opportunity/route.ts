import { generateText, Output } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const opportunitySchema = z.object({
  title: z.string().describe('כותרת ההזדמנות בעברית'),
  description: z.string().describe('תיאור מפורט של ההזדמנות בעברית'),
  impactScore: z.number().min(1).max(100).describe('ציון השפעה מ-1 עד 100'),
  confidenceScore: z.number().min(1).max(100).describe('ציון ודאות מ-1 עד 100'),
  priority: z.enum(['דחופה', 'גבוהה', 'בינונית', 'נמוכה']).describe('רמת העדיפות'),
  recommendedActions: z.array(z.string()).describe('רשימת פעולות מומלצות בעברית'),
  type: z.string().describe('סוג ההזדמנות - טכנולוגיה, שוק, שותפות, מוצר וכדומה'),
})

export async function POST(request: Request) {
  try {
    const { signals, companyProfile } = await request.json()

    if (!signals || !Array.isArray(signals)) {
      return NextResponse.json(
        { success: false, error: 'נדרש מערך של סיגנלים' },
        { status: 400 }
      )
    }

    const { output } = await generateText({
      model: 'anthropic/claude-sonnet-4-20250514',
      output: Output.object({
        schema: opportunitySchema,
      }),
      messages: [
        {
          role: 'system',
          content: `אתה מנתח מודיעין עסקי מומחה לשוק הישראלי.
תפקידך לנתח סיגנלים עסקיים ולזהות הזדמנויות לחברה.
כל התשובות שלך חייבות להיות בעברית מלאה ומקצועית.
התחשב בהקשר המקומי הישראלי והתרבות העסקית.`,
        },
        {
          role: 'user',
          content: `נתח את הסיגנלים הבאים וזהה הזדמנות עסקית:

פרופיל החברה:
${JSON.stringify(companyProfile, null, 2)}

סיגנלים שזוהו:
${JSON.stringify(signals, null, 2)}

אנא ספק ניתוח מקיף של ההזדמנות כולל:
- כותרת תמציתית וברורה
- תיאור מפורט
- ציון השפעה (1-100)
- ציון ודאות (1-100)
- עדיפות (דחופה/גבוהה/בינונית/נמוכה)
- פעולות מומלצות ספציפיות
- סוג ההזדמנות`,
        },
      ],
    })

    if (!output) {
      return NextResponse.json(
        { success: false, error: 'לא התקבלה תשובה מהמודל' },
        { status: 500 }
      )
    }

    // Save to Supabase
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
