import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { createGroq } from "@ai-sdk/groq"
import { generateText } from "ai"

const groq = createGroq({ apiKey: process.env.GROQ_API_KEY })

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

    // Fetch company profile for context
    const { data: company } = await supabase
      .from("companies")
      .select("name, industry, description")
      .eq("id", user.id)
      .single()

    // Try to fetch website content using Firecrawl if available
    let websiteContent = ""
    if (competitorWebsite && process.env.FIRECRAWL_API_KEY) {
      try {
        const firecrawlResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.FIRECRAWL_API_KEY}`,
          },
          body: JSON.stringify({
            url: competitorWebsite,
            formats: ["markdown"],
          }),
        })

        if (firecrawlResponse.ok) {
          const firecrawlData = await firecrawlResponse.json()
          if (firecrawlData.success && firecrawlData.data?.markdown) {
            // Limit content to avoid token limits
            websiteContent = firecrawlData.data.markdown.slice(0, 8000)
          }
        }
      } catch (e) {
        console.error("Firecrawl error:", e)
      }
    }

    const prompt = `אתה אנליסט עסקי מומחה. נתח את המתחרה הבא עבור החברה שלנו.

החברה שלנו:
- שם: ${company?.name || "לא ידוע"}
- תעשייה: ${company?.industry || "לא ידוע"}
- תיאור: ${company?.description || "לא ידוע"}

המתחרה לניתוח:
- שם: ${competitorName}
- אתר: ${competitorWebsite || "לא ידוע"}
${websiteContent ? `\nתוכן מהאתר:\n${websiteContent}` : ""}

צור ניתוח תחרותי מקיף בעברית. החזר JSON בפורמט הבא בלבד:
{
  "overview": "תיאור כללי של המתחרה ב-2-3 משפטים",
  "products": ["מוצר/שירות 1", "מוצר/שירות 2", "מוצר/שירות 3"],
  "pricing": "מידע על תמחור אם זמין, אחרת הערכה",
  "strengths": ["חוזקה 1", "חוזקה 2", "חוזקה 3"],
  "weaknesses": ["חולשה 1", "חולשה 2", "חולשה 3"],
  "positioning": "איך הם ממוצבים בשוק",
  "threatLevel": "גבוה" | "בינוני" | "נמוך",
  "opportunities": ["הזדמנות 1 להתחרות בהם", "הזדמנות 2"],
  "recommendations": ["המלצה 1", "המלצה 2"]
}

החזר רק JSON תקין, ללא טקסט נוסף.`

    const { text } = await generateText({
      model: groq("llama-3.3-70b-versatile"),
      prompt,
      maxTokens: 2000,
    })

    // Parse JSON from response
    let analysis
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0])
      } else {
        throw new Error("No JSON found")
      }
    } catch {
      return NextResponse.json({ 
        success: false, 
        error: "שגיאה בניתוח התוצאות" 
      }, { status: 500 })
    }

    // Save analysis to database
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

    // Update competitor threat score based on analysis
    const threatScoreMap: Record<string, number> = {
      "גבוה": 85,
      "בינוני": 60,
      "נמוך": 35,
    }
    const threatScore = threatScoreMap[analysis.threatLevel] || 60

    await supabase
      .from("competitors")
      .update({ 
        threat_score: threatScore,
        positioning: analysis.positioning,
      })
      .eq("id", competitorId)

    return NextResponse.json({
      success: true,
      analysis,
    })
  } catch (error) {
    console.error("Error analyzing competitor:", error)
    return NextResponse.json(
      { success: false, error: "שגיאה בניתוח המתחרה" },
      { status: 500 }
    )
  }
}
