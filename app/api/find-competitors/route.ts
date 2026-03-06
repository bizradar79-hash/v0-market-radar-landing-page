import { getCompanyContext } from '@/lib/getCompanyContext'
import Groq from 'groq-sdk'
import { NextResponse } from 'next/server'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const ctx = await getCompanyContext()

    const industry = body.industry || ctx?.company?.industry
    const description = body.description || ctx?.company?.description
    const city = body.city || ctx?.company?.city

    if (!industry) {
      return NextResponse.json({ success: false, error: 'נדרש לציין תעשייה' }, { status: 400 })
    }

    const result = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: `
מצא 5 מתחרים ישראליים אמיתיים לחברה בתחום ${industry}.
תיאור החברה: ${description || 'לא צוין'}
עיר: ${city || 'לא צוין'}

כללים:
1. רק חברות ישראליות קיימות ואמיתיות
2. כתובת אתר אמיתית וקיימת - חובה (דומיין .co.il, .com, או .org.il)
3. הסבר למה הם מתחרים
4. ציון דמיון ריאלי (60-95)

החזר JSON בלבד:
{
  "competitors": [{
    "name": "שם אמיתי",
    "website": "https://example.co.il",
    "reason": "למה הם מתחרים - תיאור ספציפי",
    "services": "השירותים/מוצרים שלהם",
    "similarity": 85
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

    return NextResponse.json({
      success: true,
      competitors: parsed.competitors,
    })
  } catch (error) {
    console.error('Error finding competitors:', error)
    return NextResponse.json({ success: false, error: 'לא הצלחנו למצוא מתחרים, נסה שנית' }, { status: 500 })
  }
}
