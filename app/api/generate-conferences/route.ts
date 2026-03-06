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
    
    // Generate dates in the next 6 months
    const now = new Date()
    const getRandomFutureDate = () => {
      const daysToAdd = Math.floor(Math.random() * 180) + 30
      const date = new Date(now)
      date.setDate(date.getDate() + daysToAdd)
      return date.toISOString().split('T')[0]
    }

    const prompt = `אתה מומחה לכנסים ואירועים עסקיים בישראל.

פרופיל החברה:
- תעשייה: ${company.industry || 'טכנולוגיה'}
- עיר: ${company.city || 'תל אביב'}
- מילות מפתח: ${keywords || 'לא צוינו'}

צור בדיוק 5 כנסים ואירועים עסקיים רלוונטיים לתעשייה הזו בישראל.
עבור כל כנס תן:
- שם הכנס (בעברית)
- מיקום: עיר בישראל
- תיאור קצר (משפט אחד)
- קטגוריה: "טכנולוגיה", "עסקים", "סטארטאפים", "פיננסים", או "חדשנות"

החזר JSON תקין בלבד:
{
  "conferences": [
    {
      "name": "שם הכנס",
      "location": "תל אביב",
      "description": "תיאור קצר של הכנס",
      "category": "טכנולוגיה"
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

    const conferencesToInsert = parsed.conferences.map((conf: {
      name: string
      location: string
      description: string
      category: string
    }) => ({
      company_id: user.id,
      name: conf.name,
      date: getRandomFutureDate(),
      location: conf.location,
      description: conf.description,
      url: '#',
      category: conf.category,
    }))

    const { data: savedConferences, error: insertError } = await supabase
      .from('conferences')
      .insert(conferencesToInsert)
      .select()

    if (insertError) {
      return NextResponse.json({ success: false, error: 'שגיאה בשמירת הכנסים' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      conferences: savedConferences,
      count: savedConferences?.length || 0,
    })
  } catch (error) {
    console.error('Error generating conferences:', error)
    return NextResponse.json({ success: false, error: 'שגיאה ביצירת הכנסים' }, { status: 500 })
  }
}
