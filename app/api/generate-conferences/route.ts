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
מצא 6 כנסים עסקיים קרובים בישראל ב-2026 הרלוונטיים לתחום ${company?.industry || 'הפעילות'}.

${context}

השתמש בכנסים אמיתיים כמו: DLD Tel Aviv, Mind the Tech, ועידת ישראל לעסקים, Cybertech, וכנסים אחרים.
לינקים - השתמש רק באתרי כנסים אמיתיים.

החזר JSON בלבד:
{
  "conferences": [{
    "name": "שם הכנס",
    "date": "15 אפריל 2026",
    "location": "תל אביב",
    "description": "תיאור קצר של הכנס",
    "url": "https://example.com",
    "category": "טכנולוגיה",
    "price": "₪500"
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

    // Delete old conferences and insert new ones
    await supabase.from('conferences').delete().eq('company_id', user.id)
    
    const { data: savedConferences, error: insertError } = await supabase
      .from('conferences')
      .insert(parsed.conferences.map((c: {
        name: string
        date: string
        location: string
        description: string
        url: string
        category: string
        price?: string
      }) => ({ ...c, company_id: user.id })))
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
