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

    const prompt = `אתה עורך חדשות עסקיות בישראל.

פרופיל החברה:
- תעשייה: ${company.industry || 'טכנולוגיה'}
- תיאור: ${company.description || 'לא צוין'}
- מילות מפתח: ${keywords || 'לא צוינו'}

צור בדיוק 5 כתבות חדשות עסקיות רלוונטיות לתעשייה הזו.
עבור כל כתבה תן:
- כותרת (קצרה וקליטה)
- תקציר (2-3 משפטים)
- מקור: "כלכליסט", "גלובס", "TheMarker", "Geektime", או "Ynet"
- קטגוריה: "גיוסים", "רגולציה", "שותפויות", "השקעות", או "מוצרים"
- סנטימנט: "positive", "negative", או "neutral"

החזר JSON תקין בלבד:
{
  "news": [
    {
      "title": "כותרת הכתבה",
      "summary": "תקציר הכתבה",
      "source": "כלכליסט",
      "category": "גיוסים",
      "sentiment": "positive"
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

    const newsToInsert = parsed.news.map((item: {
      title: string
      summary: string
      source: string
      category: string
      sentiment: string
    }) => ({
      company_id: user.id,
      title: item.title,
      summary: item.summary,
      source: item.source,
      url: '#',
      category: item.category,
      sentiment: item.sentiment,
      published_at: new Date().toISOString(),
    }))

    const { data: savedNews, error: insertError } = await supabase
      .from('news')
      .insert(newsToInsert)
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
