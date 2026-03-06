import { createClient } from "@/lib/supabase/server"
import { analyzeWithAI } from "@/lib/ai"
import { scrapeWebsite } from "@/lib/scrape"
import { search } from "@/lib/search"
import { NextResponse } from "next/server"

export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: "לא מחובר" }, { status: 401 })
    }

    const { competitorId, competitorName, competitorWebsite } = await request.json()

    if (!competitorId || !competitorName) {
      return NextResponse.json({ success: false, error: "חסרים פרטי מתחרה" }, { status: 400 })
    }

    const { data: company } = await supabase
      .from("companies")
      .select("name, industry, description")
      .eq("id", user.id)
      .single()

    const [websiteContent, searchResults] = await Promise.all([
      competitorWebsite ? scrapeWebsite(competitorWebsite) : Promise.resolve(''),
      search(`${competitorName} ישראל מוצרים שירותים`, 6),
    ])

    const analysis = await analyzeWithAI(`נתח את המתחרה הבא עבור החברה שלנו.

החברה שלנו:
- שם: ${company?.name || "לא ידוע"}
- תעשייה: ${company?.industry || "לא ידוע"}
- תיאור: ${company?.description || "לא ידוע"}

המתחרה:
- שם: ${competitorName}
- אתר: ${competitorWebsite || "לא ידוע"}
${websiteContent ? `\nתוכן מהאתר:\n${websiteContent.slice(0, 3000)}` : ""}

תוצאות חיפוש:
${searchResults.map(r => `[${r.title}] ${r.url} - ${r.content}`).join('\n')}

החזר JSON בפורמט זה בלבד:
{
  "overview": "תיאור כללי של המתחרה",
  "products": ["מוצר 1", "מוצר 2", "מוצר 3"],
  "pricing": "מידע על תמחור",
  "strengths": ["חוזקה 1", "חוזקה 2", "חוזקה 3"],
  "weaknesses": ["חולשה 1", "חולשה 2", "חולשה 3"],
  "positioning": "מיצוב בשוק",
  "threatLevel": "בינוני",
  "opportunities": ["הזדמנות 1", "הזדמנות 2"],
  "recommendations": ["המלצה 1", "המלצה 2"]
}`)

    await supabase.from("competitive_analysis").insert({
      company_id: user.id,
      data: {
        competitor_id: competitorId,
        competitor_name: competitorName,
        competitor_website: competitorWebsite,
        analysis,
        analyzed_at: new Date().toISOString(),
      },
    })

    const threatScoreMap: Record<string, number> = {
      "גבוה": 85,
      "בינוני": 60,
      "נמוך": 35,
    }
    const threatScore = threatScoreMap[analysis.threatLevel] || 60

    await supabase
      .from("competitors")
      .update({ threat_score: threatScore, positioning: analysis.positioning })
      .eq("id", competitorId)

    return NextResponse.json({ success: true, analysis })
  } catch (error) {
    console.error("Error analyzing competitor:", error)
    return NextResponse.json(
      { success: false, error: "שגיאה בניתוח המתחרה" },
      { status: 500 }
    )
  }
}
