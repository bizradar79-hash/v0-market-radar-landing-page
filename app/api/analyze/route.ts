import Groq from 'groq-sdk'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

export async function POST() {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: 'משתמש לא מחובר' },
        { status: 401 }
      )
    }

    // Fetch company profile
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('*')
      .eq('id', user.id)
      .single()

    if (companyError || !company) {
      return NextResponse.json(
        { success: false, error: 'לא נמצא פרופיל חברה' },
        { status: 404 }
      )
    }

    // Check throttling - only allow analysis every 5 minutes
    const THROTTLE_MINUTES = 5
    if (company.last_analyzed) {
      const lastAnalyzed = new Date(company.last_analyzed)
      const now = new Date()
      const diffMinutes = (now.getTime() - lastAnalyzed.getTime()) / (1000 * 60)
      
      if (diffMinutes < THROTTLE_MINUTES) {
        const waitMinutes = Math.ceil(THROTTLE_MINUTES - diffMinutes)
        return NextResponse.json({
          success: false,
          error: `יש להמתין ${waitMinutes} דקות לפני ניתוח נוסף`,
          throttled: true,
          waitMinutes,
        }, { status: 429 })
      }
    }

    // Fetch competitors
    const { data: competitors } = await supabase
      .from('competitors')
      .select('name')
      .eq('company_id', user.id)

    const competitorNames = competitors?.map(c => c.name).join(', ') || 'לא צוינו'
    const keywords = Array.isArray(company.keywords) ? company.keywords.join(', ') : 'לא צוינו'

    const prompt = `אתה מומחה לאינטליגנציה עסקית בשוק הישראלי. תפקידך לזהות הזדמנויות עסקיות ריאליות ומעשיות.

פרופיל החברה:
- שם: ${company.name || 'לא צוין'}
- תעשייה: ${company.industry || 'לא צוין'}
- עיר: ${company.city || 'לא צוין'}
- תיאור: ${company.description || 'לא צוין'}
- מתחרים: ${competitorNames}
- מילות מפתח: ${keywords}

צור בדיוק 5 הזדמנויות עסקיות מגוונות ומפורטות. התמקד ב:
1. שוק לא מנוצל - פלחי שוק או אזורים גיאוגרפיים בישראל שאינם מטופלים
2. שיתוף פעולה - הזדמנויות לשותפויות עם חברות משלימות
3. צמיחה - אפשרויות להרחבת קו המוצרים או השירותים
4. חדשנות - טכנולוגיות או מגמות חדשות שניתן לאמץ
5. ייעול - הזדמנויות לשיפור תהליכים או הפחתת עלויות

עבור כל הזדמנות תן:
- כותרת קצרה וברורה (עד 10 מילים)
- תיאור מפורט של ההזדמנות (2-3 משפטים)
- ציון השפעה (60-95) - כמה משמעותית ההזדמנות
- ציון ביטחון (50-90) - כמה בטוחים אנחנו בניתוח
- עדיפות: "דחופה", "גבוהה", "בינונית", או "נמוכה"
- סוג: "שוק לא מנוצל", "שיתוף פעולה", "צמיחה", "חדשנות", או "ייעול"
- 3 פעולות מומלצות ספציפיות ומעשיות
- מקור אחד (למשל: "ניתוח שוק", "מחקר מתחרים", "מגמות ענף")

החזר JSON תקין בלבד, ללא טקסט נוסף:
{
  "opportunities": [
    {
      "title": "כותרת",
      "description": "תיאור מפורט",
      "impact_score": 85,
      "confidence_score": 75,
      "priority": "גבוהה",
      "type": "שוק לא מנוצל",
      "actions": ["פעולה 1", "פעולה 2", "פעולה 3"],
      "sources": ["מקור"]
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
      return NextResponse.json(
        { success: false, error: 'שגיאה בפענוח התשובה מהמודל' },
        { status: 500 }
      )
    }

    // Save opportunities to Supabase
    const opportunitiesToInsert = parsed.opportunities.map((opp: {
      title: string
      description: string
      impact_score: number
      confidence_score: number
      priority: string
      type: string
      actions: string[]
      sources: string[]
    }) => ({
      company_id: user.id,
      title: opp.title,
      description: opp.description,
      impact_score: opp.impact_score,
      confidence_score: opp.confidence_score,
      priority: opp.priority,
      type: opp.type,
      actions: opp.actions,
      sources: opp.sources,
    }))

    const { data: savedOpportunities, error: insertError } = await supabase
      .from('opportunities')
      .insert(opportunitiesToInsert)
      .select()

    if (insertError) {
      return NextResponse.json(
        { success: false, error: 'שגיאה בשמירת ההזדמנויות' },
        { status: 500 }
      )
    }

    // Update last_analyzed timestamp
    await supabase
      .from('companies')
      .update({ last_analyzed: new Date().toISOString() })
      .eq('id', user.id)

    return NextResponse.json({
      success: true,
      opportunities: savedOpportunities,
      count: savedOpportunities?.length || 0,
    })
  } catch (error) {
    console.error('Error analyzing opportunities:', error)
    return NextResponse.json(
      { success: false, error: 'שגיאה בניתוח ההזדמנויות' },
      { status: 500 }
    )
  }
}
