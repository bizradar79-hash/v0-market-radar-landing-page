import { generateText, Output } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const competitorSchema = z.object({
  competitors: z.array(
    z.object({
      name: z.string().describe('שם המתחרה'),
      website: z.string().describe('כתובת האתר'),
      similarity: z.number().min(1).max(100).describe('אחוז דמיון ל-1 עד 100'),
      description: z.string().describe('תיאור קצר של המתחרה בעברית'),
      strengths: z.array(z.string()).describe('נקודות חוזק'),
      threatLevel: z.enum(['גבוה', 'בינוני', 'נמוך']).describe('רמת האיום'),
    })
  ).describe('רשימת 5 מתחרים'),
})

export async function POST(request: Request) {
  try {
    const { website, industry, companyName } = await request.json()

    if (!industry) {
      return NextResponse.json(
        { success: false, error: 'נדרש לציין תעשייה' },
        { status: 400 }
      )
    }

    const { output } = await generateText({
      model: 'anthropic/claude-sonnet-4-20250514',
      output: Output.object({
        schema: competitorSchema,
      }),
      messages: [
        {
          role: 'system',
          content: `אתה מומחה לניתוח תחרותי בשוק הישראלי.
תפקידך לזהות ולנתח מתחרים פוטנציאליים לעסקים ישראליים.
התמקד במתחרים ישראליים ובינלאומיים הפועלים בישראל.
כל התשובות שלך חייבות להיות בעברית מלאה.`,
        },
        {
          role: 'user',
          content: `זהה 5 מתחרים עבור:

${companyName ? `שם החברה: ${companyName}` : ''}
${website ? `אתר: ${website}` : ''}
תעשייה: ${industry}

עבור כל מתחרה ספק:
- שם החברה
- כתובת אתר (השתמש בפורמט תקין)
- אחוז דמיון (1-100)
- תיאור קצר בעברית
- נקודות חוזק
- רמת איום (גבוה/בינוני/נמוך)

התמקד במתחרים אמיתיים ורלוונטיים בשוק הישראלי.`,
        },
      ],
    })

    if (!output) {
      return NextResponse.json(
        { success: false, error: 'לא התקבלה תשובה מהמודל' },
        { status: 500 }
      )
    }

    // Save competitors to Supabase
    const supabase = await createClient()
    for (const competitor of output.competitors) {
      await supabase.from('competitors').insert({
        name: competitor.name,
        activity_type: 'זיהוי אוטומטי',
        change_description: competitor.description,
        impact: competitor.threatLevel,
        threat_score: competitor.similarity,
        services: competitor.strengths.join(', '),
      })
    }

    return NextResponse.json({
      success: true,
      companyName,
      competitors: output.competitors,
    })
  } catch (error) {
    console.error('Error finding competitors:', error)
    return NextResponse.json(
      { success: false, error: 'שגיאה באיתור מתחרים' },
      { status: 500 }
    )
  }
}
