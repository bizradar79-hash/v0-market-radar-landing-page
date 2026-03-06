import { getCompanyContext } from '@/lib/getCompanyContext'
import Groq from 'groq-sdk'
import { NextResponse } from 'next/server'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

export async function POST() {
  try {
    const ctx = await getCompanyContext()
    if (!ctx) {
      return NextResponse.json({ success: false, error: 'משתמש לא מחובר' }, { status: 401 })
    }

    const { company, supabase, user, context } = ctx

    // Check throttling - only allow analysis every 5 minutes
    const THROTTLE_MINUTES = 5
    if (company?.last_analyzed) {
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

    const result = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: `
אתה יועץ עסקי בכיר המתמחה בשוק הישראלי.
בהתבסס על המידע הבא, צור 5 הזדמנויות עסקיות ספציפיות, מעשיות ובעלות ערך גבוה.

${context}

דרישות קריטיות:
- כל הזדמנות חייבת להיות ספציפית לתחום ${company?.industry || 'הפעילות'} ולשוק הישראלי
- אל תציע דברים כלליים כמו "שפר שיווק" - תהיה קונקרטי
- בסס על נתונים אמיתיים מהתעשייה
- כל פעולה מומלצת חייבת להיות ניתנת לביצוע תוך שבוע
- אל תכלול את החברה ${company?.name || ''} עצמה כהזדמנות
- התמקד בהזדמנויות מגוונות: שוק חדש, שותפות, חדשנות, ייעול, צמיחה

החזר JSON בלבד:
{
  "opportunities": [{
    "title": "כותרת ספציפית ומעשית",
    "description": "תיאור מפורט 3-4 משפטים עם נתונים ספציפיים",
    "impact_score": 85,
    "confidence_score": 78,
    "priority": "גבוהה",
    "type": "סוג הזדמנות",
    "actions": ["פעולה קונקרטית 1", "פעולה קונקרטית 2", "פעולה קונקרטית 3"],
    "sources": ["מקור ספציפי"]
  }]
}` }],
      temperature: 0.7,
    })

    const text = result.choices[0].message.content!
      .replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      return NextResponse.json({ success: false, error: 'שגיאה בפענוח התשובה מהמודל' }, { status: 500 })
    }

    // Delete old opportunities and insert new ones
    await supabase.from('opportunities').delete().eq('company_id', user.id)
    
    const { data: savedOpportunities, error: insertError } = await supabase
      .from('opportunities')
      .insert(parsed.opportunities.map((o: {
        title: string
        description: string
        impact_score: number
        confidence_score: number
        priority: string
        type: string
        actions: string[]
        sources: string[]
      }) => ({ ...o, company_id: user.id })))
      .select()

    if (insertError) {
      return NextResponse.json({ success: false, error: 'שגיאה בשמירת ההזדמנויות' }, { status: 500 })
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
    return NextResponse.json({ success: false, error: 'שגיאה בניתוח ההזדמנויות' }, { status: 500 })
  }
}
