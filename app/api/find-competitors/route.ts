import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextResponse } from 'next/server'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!)
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

function stripMarkdownFences(text: string): string {
  return text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
}

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
