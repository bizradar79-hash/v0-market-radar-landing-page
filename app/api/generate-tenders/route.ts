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

    const result = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: `
אתה מומחה למכרזים ממשלתיים בישראל.
${context}

מצא 4 מכרזים ממשלתיים או עירוניים ישראליים רלוונטיים לתחום ${company?.industry || 'הפעילות'}.

כללים:
1. רק מכרזים מ: mr.gov.il, ורשויות מקומיות ישראליות
2. הלינק חייב להיות לדף מכרזים אמיתי - השתמש ב https://mr.gov.il/tenders
3. תקציב ריאלי ומשוער בשקלים
4. מועד אחרון הגשה ריאלי (בפורמט YYYY-MM-DD)

החזר JSON בלבד:
{
  "tenders": [{
    "title": "כותרת מכרז",
    "organization": "שם הארגון",
    "deadline": "2026-04-15",
    "budget": "500,000 - 1,000,000 ש״ח",
    "description": "תיאור קצר",
    "link": "https://mr.gov.il/tenders",
    "relevance_score": 85
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
      return NextResponse.json({ success: false, error: 'שגיאה בפענוח התשובה' }, { status: 500 })
    }

    // Delete old tenders and insert new ones
    await supabase.from('tenders').delete().eq('company_id', user.id)
    
    const { data: savedTenders, error: insertError } = await supabase
      .from('tenders')
      .insert(parsed.tenders.map((t: {
        title: string
        organization: string
        deadline: string
        budget: string
        description: string
        link: string
        relevance_score: number
      }) => ({ ...t, company_id: user.id })))
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
