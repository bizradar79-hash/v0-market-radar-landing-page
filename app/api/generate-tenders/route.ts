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
    
    // Generate dates in the next 3 months
    const getRandomFutureDate = () => {
      const now = new Date()
      const daysToAdd = Math.floor(Math.random() * 90) + 7
      const date = new Date(now)
      date.setDate(date.getDate() + daysToAdd)
      return date.toISOString().split('T')[0]
    }

    const prompt = `אתה מומחה למכרזים ממשלתיים ועירוניים בישראל.

פרופיל החברה:
- שם: ${company.name || 'לא צוין'}
- תעשייה: ${company.industry || 'טכנולוגיה'}
- תיאור: ${company.description || 'לא צוין'}
- מילות מפתח: ${keywords || 'לא צוינו'}

צור בדיוק 5 מכרזים רלוונטיים לתעשייה של החברה.
עבור כל מכרז תן:
- כותרת המכרז (בעברית)
- גוף מפרסם: שם משרד ממשלתי, עירייה, או חברה ממשלתית ישראלית
- תקציב משוער (בשקלים, לדוגמה: "500,000 - 1,000,000 ש\"ח")
- תיאור קצר (2-3 משפטים)
- ציון רלוונטיות (60-95)

החזר JSON תקין בלבד:
{
  "tenders": [
    {
      "title": "כותרת המכרז",
      "organization": "שם הגוף המפרסם",
      "budget": "500,000 - 1,000,000 ש\"ח",
      "description": "תיאור קצר של המכרז",
      "relevance_score": 85
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

    const tendersToInsert = parsed.tenders.map((tender: {
      title: string
      organization: string
      budget: string
      description: string
      relevance_score: number
    }) => ({
      company_id: user.id,
      title: tender.title,
      organization: tender.organization,
      deadline: getRandomFutureDate(),
      budget: tender.budget,
      description: tender.description,
      link: '#',
      relevance_score: tender.relevance_score,
    }))

    const { data: savedTenders, error: insertError } = await supabase
      .from('tenders')
      .insert(tendersToInsert)
      .select()

    if (insertError) {
      return NextResponse.json({ success: false, error: 'שגיאה בשמירת המכרזים' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      tenders: savedTenders,
      count: savedTenders?.length || 0,
    })
  } catch (error) {
    console.error('Error generating tenders:', error)
    return NextResponse.json({ success: false, error: 'שגיאה ביצירת המכרזים' }, { status: 500 })
  }
}
