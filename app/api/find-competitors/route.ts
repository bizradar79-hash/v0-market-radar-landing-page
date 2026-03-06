import Groq from 'groq-sdk'
import { NextResponse } from 'next/server'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

export async function POST(request: Request) {
  try {
    const { industry, description, city, website } = await request.json()

    if (!industry) {
      return NextResponse.json(
        { success: false, error: 'נדרש לציין תעשייה' },
        { status: 400 }
      )
    }

    const prompt = `אתה מומחה לשוק הישראלי.
מצא 5 מתחרים ישראליים אמיתיים ופוטנציאליים לחברה:
תעשייה: ${industry}
תיאור: ${description || 'לא צוין'}
עיר: ${city || 'לא צוין'}
${website ? `אתר: ${website}` : ''}

החזר JSON בלבד:
{
  "competitors": [
    {
      "name": "שם החברה",
      "website": "website.co.il",
      "reason": "למה הם מתחרים",
      "similarity": 85
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

    // Return competitors without saving - user will select which ones to add
    return NextResponse.json({
      success: true,
      competitors: parsed.competitors,
    })
  } catch (error) {
    console.error('Error finding competitors:', error)
    return NextResponse.json(
      { success: false, error: 'לא הצלחנו למצוא מתחרים, נסה שנית' },
      { status: 500 }
    )
  }
}
