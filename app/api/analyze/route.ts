import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!)
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

function stripMarkdownFences(text: string): string {
  return text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
}

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

    // Fetch competitors
    const { data: competitors } = await supabase
      .from('competitors')
      .select('name')
      .eq('company_id', user.id)

    const competitorNames = competitors?.map(c => c.name).join(', ') || ''
    const keywords = Array.isArray(company.keywords) ? company.keywords.join(', ') : ''

    const prompt = `אתה מומחה לאינטליגנציה עסקית בשוק הישראלי.
בהתבסס על פרופיל החברה הבא, צור 5 הזדמנויות עסקיות ריאליות:
שם: ${company.name || 'לא צוין'}
תעשייה: ${company.industry || 'לא צוין'}
עיר: ${company.city || 'לא צוין'}
תיאור: ${company.description || 'לא צוין'}
מתחרים: ${competitorNames || 'לא צוינו'}
מילות מפתח: ${keywords || 'לא צוינו'}

החזר JSON בלבד:
{
  "opportunities": [
    {
      "title": "כותרת קצרה",
      "description": "תיאור מפורט של ההזדמנות",
      "impact_score": 85,
      "confidence_score": 78,
      "priority": "גבוהה",
      "type": "שוק לא מנוצל",
      "actions": ["פעולה 1", "פעולה 2", "פעולה 3"],
      "sources": ["מקור 1"]
    }
  ]
}`

    const result = await model.generateContent(prompt)
    const responseText = result.response.text()
    const cleanedJson = stripMarkdownFences(responseText)
    
    let parsed
    try {
      parsed = JSON.parse(cleanedJson)
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

    return NextResponse.json({
      success: true,
      opportunities: savedOpportunities,
    })
  } catch (error) {
    console.error('Error analyzing opportunities:', error)
    return NextResponse.json(
      { success: false, error: 'שגיאה בניתוח ההזדמנויות' },
      { status: 500 }
    )
  }
}
