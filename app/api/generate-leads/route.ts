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
אתה מומחה לגילוי לידים בשוק הישראלי.
${context}

מצא 5 לידים עסקיים פוטנציאליים לחברה ${company?.name || ''}.

כללים קריטיים:
1. אל תכלול את החברה ${company?.name || ''} עצמה ברשימה
2. רק חברות ישראליות קיימות ואמיתיות
3. האתר חייב להיות קיים ואמיתי - רק דומיינים ישראליים (.co.il, .com, .org.il)
4. הסיבה לגילוי חייבת להיות ספציפית ומבוססת על צרכים אמיתיים
5. ציון הליד חייב לשקף את הרלוונטיות האמיתית

החזר JSON בלבד:
{
  "leads": [{
    "name": "שם חברה ישראלית אמיתית",
    "website": "https://example.co.il",
    "industry": "תעשייה",
    "location": "עיר בישראל",
    "reason": "סיבה ספציפית ומפורטת",
    "score": 85,
    "source": "מקור המידע"
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

    // Filter out own company
    const companyDomain = company?.website?.replace('https://', '').replace('http://', '').replace('www.', '').split('/')[0] || ''
    const filtered = parsed.leads.filter((l: { name: string; website: string }) => 
      !l.name.toLowerCase().includes((company?.name || '').toLowerCase()) && 
      !l.website.toLowerCase().includes(companyDomain.toLowerCase())
    )

    // Delete old leads and insert new ones
    await supabase.from('leads').delete().eq('company_id', user.id)
    
    const { data: savedLeads, error: insertError } = await supabase
      .from('leads')
      .insert(filtered.map((l: {
        name: string
        website: string
        industry: string
        location: string
        reason: string
        score: number
        source: string
      }) => ({ ...l, company_id: user.id })))
      .select()

    if (insertError) {
      return NextResponse.json({ success: false, error: 'שגיאה בשמירת הלידים' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      leads: savedLeads,
      count: savedLeads?.length || 0,
    })
  } catch (error) {
    console.error('Error generating leads:', error)
    return NextResponse.json({ success: false, error: 'שגיאה ביצירת הלידים' }, { status: 500 })
  }
}
