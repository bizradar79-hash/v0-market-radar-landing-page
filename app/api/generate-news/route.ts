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
אתה עורך חדשות עסקיות ישראלי.
${context}

צור 8 פריטי חדשות עסקיות רלוונטיות לתחום ${company?.industry || 'הפעילות'} בישראל.

כללים:
1. שתמש רק בלינקים אמיתיים לאתרי חדשות: 
   - https://www.calcalist.co.il
   - https://www.themarker.com  
   - https://www.globes.co.il
   - https://www.ctech.calcalist.co.il
2. הכותרות חייבות להיות רלוונטיות לתחום ולשוק הישראלי
3. אל תמציא כתובות URL ספציפיות - השתמש בדף הבית של האתר

החזר JSON בלבד:
{
  "news": [{
    "title": "כותרת חדשות רלוונטית",
    "source": "Calcalist",
    "url": "https://www.calcalist.co.il",
    "category": "קטגוריה",
    "sentiment": "positive",
    "summary": "תקציר קצר 2-3 משפטים"
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

    // Delete old news and insert new ones
    await supabase.from('news').delete().eq('company_id', user.id)
    
    const { data: savedNews, error: insertError } = await supabase
      .from('news')
      .insert(parsed.news.map((n: {
        title: string
        source: string
        url: string
        category: string
        sentiment: string
        summary: string
      }) => ({ ...n, company_id: user.id, published_at: new Date().toISOString() })))
      .select()

    if (insertError) {
      return NextResponse.json({ success: false, error: 'שגיאה בשמירת החדשות' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      news: savedNews,
      count: savedNews?.length || 0,
    })
  } catch (error) {
    console.error('Error generating news:', error)
    return NextResponse.json({ success: false, error: 'שגיאה ביצירת החדשות' }, { status: 500 })
  }
}
