import { generateText, Output } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const trendAnalysisSchema = z.object({
  summary: z.string().describe('סיכום כללי של הטרנד בעברית'),
  direction: z.enum(['עולה', 'יורד', 'יציב']).describe('כיוון הטרנד'),
  strength: z.number().min(1).max(100).describe('עוצמת הטרנד'),
  timeframe: z.string().describe('מסגרת זמן צפויה'),
  impact: z.object({
    opportunities: z.array(z.string()).describe('הזדמנויות שנובעות מהטרנד'),
    threats: z.array(z.string()).describe('איומים פוטנציאליים'),
    neutrals: z.array(z.string()).describe('השפעות ניטרליות'),
  }),
  recommendations: z.array(
    z.object({
      action: z.string().describe('הפעולה המומלצת'),
      priority: z.enum(['גבוהה', 'בינונית', 'נמוכה']).describe('עדיפות'),
      timeline: z.string().describe('לוח זמנים מומלץ'),
    })
  ).describe('המלצות אסטרטגיות'),
  relatedTrends: z.array(z.string()).describe('טרנדים קשורים'),
  confidence: z.number().min(1).max(100).describe('רמת הביטחון בניתוח'),
})

export async function POST(request: Request) {
  try {
    const { trendData, companyContext } = await request.json()

    if (!trendData || !Array.isArray(trendData)) {
      return NextResponse.json(
        { success: false, error: 'נדרש מידע על טרנדים' },
        { status: 400 }
      )
    }

    const { output } = await generateText({
      model: 'anthropic/claude-sonnet-4-20250514',
      output: Output.object({
        schema: trendAnalysisSchema,
      }),
      messages: [
        {
          role: 'system',
          content: `אתה אנליסט טרנדים ומגמות שוק מומחה לשוק הישראלי.
תפקידך לנתח מגמות עסקיות וטכנולוגיות ולספק תובנות אסטרטגיות.
התמקד בהשלכות מעשיות על עסקים קטנים ובינוניים בישראל.
כל התשובות שלך חייבות להיות בעברית מלאה ומקצועית.`,
        },
        {
          role: 'user',
          content: `נתח את הטרנדים הבאים וספק תובנות אסטרטגיות:

נתוני טרנדים:
${JSON.stringify(trendData, null, 2)}

${companyContext ? `הקשר עסקי:\n${JSON.stringify(companyContext, null, 2)}` : ''}

אנא ספק:
1. סיכום כללי של המגמה
2. כיוון הטרנד (עולה/יורד/יציב)
3. עוצמת הטרנד (1-100)
4. מסגרת זמן צפויה
5. השפעות - הזדמנויות, איומים, ניטרליות
6. המלצות אסטרטגיות עם עדיפות ולוח זמנים
7. טרנדים קשורים
8. רמת ביטחון בניתוח`,
        },
      ],
    })

    if (!output) {
      return NextResponse.json(
        { success: false, error: 'לא התקבלה תשובה מהמודל' },
        { status: 500 }
      )
    }

    // Save trend analysis to Supabase
    const supabase = await createClient()
    
    // Update existing trends or insert analysis results
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
