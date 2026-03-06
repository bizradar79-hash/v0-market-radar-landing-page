import Groq from 'groq-sdk'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

export async function POST() {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ success: false, error: 'משתמש לא מחובר' }, { status: 401 })
    }

    const { data: company } = await supabase
      .from('companies')
      .select('*')
      .eq('id', user.id)
      .single()

    if (!company) {
      return NextResponse.json({ success: false, error: 'לא נמצא פרופיל חברה' }, { status: 404 })
    }

    const keywords = Array.isArray(company.keywords) ? company.keywords.join(', ') : ''

    const prompt = `אתה מומחה לניתוח מגמות שוק בישראל.

פרופיל החברה:
- תעשייה: ${company.industry || 'טכנולוגיה'}
- תיאור: ${company.description || 'לא צוין'}
- מילות מפתח: ${keywords || 'לא צוינו'}

צור בדיוק 6 מגמות שוק רלוונטיות לתעשייה הזו בישראל.
עבור כל מגמה תן:
- שם המגמה (קצר וברור)
- קטגוריה: "טכנולוגיה", "תפעול", "שיווק", "פיננסים", "רגולציה", או "צרכנות"
- ציון (50-100) - עוצמת המגמה
- כיוון: "up" (עולה), "down" (יורדת), או "stable" (יציבה)
- תיאור קצר (משפט אחד)

החזר JSON תקין בלבד:
{
  "trends": [
    {
      "name": "שם המגמה",
      "category": "טכנולוגיה",
      "score": 85,
      "direction": "up",
      "description": "תיאור קצר של המגמה"
    }
  ]
}`

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    })
    
    const text = completion.choices[0].message.content!
      .replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      return NextResponse.json({ success: false, error: 'שגיאה בפענוח התשובה' }, { status: 500 })
    }

    const trendsToInsert = parsed.trends.map((trend: {
      name: string
      category: string
      score: number
      direction: string
      description: string
    }) => ({
      company_id: user.id,
      name: trend.name,
      category: trend.category,
      score: trend.score,
      direction: trend.direction,
      description: trend.description,
    }))

    const { data: savedTrends, error: insertError } = await supabase
      .from('trends')
      .insert(trendsToInsert)
      .select()

    if (insertError) {
      return NextResponse.json({ success: false, error: 'שגיאה בשמירת המגמות' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      trends: savedTrends,
      count: savedTrends?.length || 0,
    })
  } catch (error) {
    console.error('Error generating trends:', error)
    return NextResponse.json({ success: false, error: 'שגיאה ביצירת המגמות' }, { status: 500 })
  }
}
