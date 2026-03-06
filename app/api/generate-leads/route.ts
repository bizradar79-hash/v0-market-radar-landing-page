import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!)
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

function stripMarkdownFences(text: string): string {
  return text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
}

export async function POST() {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: 'משתמש לא מחובר' },
        { status: 401 }
      )
    }

    // Fetch company profile
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('*')
      .eq('id', user.id)
      .single()

    if (companyError || !company) {
      return NextResponse.json(
        { success: false, error: 'לא נמצא פרופיל חברה' },
        { status: 404 }
      )
    }

    const prompt = `אתה מומחה לגילוי לידים בשוק הישראלי.
צור 5 לידים עסקיים פוטנציאליים אמיתיים:
תעשייה: ${company.industry || 'לא צוין'}
עיר: ${company.city || 'לא צוין'}
תיאור: ${company.description || 'לא צוין'}

החזר JSON בלבד:
{
  "leads": [
    {
      "name": "שם החברה",
      "website": "website.co.il",
      "industry": "תעשייה",
      "location": "עיר בישראל",
      "reason": "למה הם ליד טוב",
      "score": 85,
      "source": "LinkedIn"
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

    // Save leads to Supabase
    const leadsToInsert = parsed.leads.map((lead: {
      name: string
      website: string
      industry: string
      location: string
      reason: string
      score: number
      source: string
    }) => ({
      company_id: user.id,
      name: lead.name,
      website: lead.website,
      industry: lead.industry,
      location: lead.location,
      reason: lead.reason,
      score: lead.score,
      source: lead.source,
    }))

    const { data: savedLeads, error: insertError } = await supabase
      .from('leads')
      .insert(leadsToInsert)
      .select()

    if (insertError) {
      return NextResponse.json(
        { success: false, error: 'שגיאה בשמירת הלידים' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      leads: savedLeads,
    })
  } catch (error) {
    console.error('Error generating leads:', error)
    return NextResponse.json(
      { success: false, error: 'שגיאה ביצירת הלידים' },
      { status: 500 }
    )
  }
}
