import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { scrapeWebsite } from '@/lib/scrape'
import type { BusinessProfile } from '@/types/business-profile'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

function extractJSON(text: string): any {
  let clean = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim()

  // Repair Hebrew gershayim that break JSON strings
  clean = clean.replace(/([\w\u0590-\u05FF])"([\w\u0590-\u05FF])/g, '$1\\"$2')

  try { return JSON.parse(clean) } catch {}

  const firstBrace = clean.indexOf('{')
  const firstBracket = clean.indexOf('[')
  let start = -1
  if (firstBrace === -1 && firstBracket === -1) return null
  if (firstBrace === -1) start = firstBracket
  else if (firstBracket === -1) start = firstBrace
  else start = Math.min(firstBrace, firstBracket)

  const openChar = clean[start]
  const closeChar = openChar === '{' ? '}' : ']'
  const end = clean.lastIndexOf(closeChar)
  if (end <= start) return null

  try { return JSON.parse(clean.slice(start, end + 1)) } catch { return null }
}

function normalizeProfile(raw: any): BusinessProfile {
  const validModels = ['B2B', 'B2C', 'B2B2C', 'mixed']

  return {
    coreActivity: String(raw.coreActivity || ''),
    businessModel: validModels.includes(raw.businessModel) ? raw.businessModel : 'mixed',
    products: Array.isArray(raw.products)
      ? raw.products.map((p: any) => ({
          name: String(p.name || ''),
          description: String(p.description || ''),
          targetAudience: String(p.targetAudience || ''),
          priceRange: p.priceRange ? String(p.priceRange) : undefined,
        }))
      : [],
    targetAudiences: Array.isArray(raw.targetAudiences) ? raw.targetAudiences.map(String) : [],
    industryTags: Array.isArray(raw.industryTags) ? raw.industryTags.map(String) : [],
    geographicMarkets: Array.isArray(raw.geographicMarkets) ? raw.geographicMarkets.map(String) : [],
    competitiveAdvantage: String(raw.competitiveAdvantage || ''),
    marketPosition: String(raw.marketPosition || ''),
    directCompetitors: Array.isArray(raw.directCompetitors) ? raw.directCompetitors.map(String) : [],
    primaryKeywords: Array.isArray(raw.primaryKeywords) ? raw.primaryKeywords.map(String) : [],
    secondaryKeywords: Array.isArray(raw.secondaryKeywords) ? raw.secondaryKeywords.map(String) : [],
    searchQueries: Array.isArray(raw.searchQueries) ? raw.searchQueries.map(String) : [],
    geoQueries: Array.isArray(raw.geoQueries) ? raw.geoQueries.map(String).slice(0, 3) : [],
    distributionChannels: Array.isArray(raw.distributionChannels) ? raw.distributionChannels.map(String) : [],
    confidenceScore: typeof raw.confidenceScore === 'number' ? Math.min(100, Math.max(0, raw.confidenceScore)) : 70,
    sourcesUsed: Array.isArray(raw.sourcesUsed) ? raw.sourcesUsed.map(String) : [],
    generatedAt: raw.generatedAt || new Date().toISOString(),
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const { companyName = '', website = '', shortDescription = '' } = body

    // Auth check
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Scrape website
    const scrapedContent = await scrapeWebsite(website)

    const prompt = `אתה אנליסט עסקי מומחה. נתח לעומק את העסק הבא וחפש מידע עליו באינטרנט:

חשוב מאוד: החזר את כל הערכים בעברית בלבד.
שמות מוצרים, תיאורים, קהלי יעד, תגיות תעשייה, יתרון תחרותי — הכל בעברית.
רק מילות מפתח לחיפוש (primaryKeywords, secondaryKeywords, searchQueries)
יכולות להיות גם באנגלית כי משתמשים בהן לחיפוש.

שם החברה: ${companyName}
אתר: ${website}
תיאור: ${shortDescription}
תוכן האתר: ${scrapedContent ? scrapedContent.slice(0, 2000) : 'לא זמין'}

נתח ומצא:
1. מה בדיוק העסק עושה - תחום פעילות ספציפי ומדויק (לא גנרי)
2. אילו מוצרים/שירותים הוא מוכר, למי, ובאיזה מחיר
3. מודל עסקי - B2B/B2C/שניהם
4. קהלי יעד ספציפיים
5. יתרון תחרותי
6. מתחרים ישירים בישראל
7. תגיות תעשייה מדויקות
8. מילות מפתח לחיפוש בעברית ואנגלית
9. שאילתות מוכנות לחיפוש מתחרים, טרנדים, הזדמנויות
9ב. שאלות GEO (geoQueries) — בדיוק 3 שאלות קצרות וטבעיות שלקוח ישראלי היה מקליד ב-ChatGPT/Gemini כדי לקבל המלצה על עסק בתחום הזה. כל שאלה 6-12 מילים, כוונה אחת ברורה בלבד, בלי ערימת תנאים. בעברית, שאלות אמיתיות (לא מילות מפתח), למשל: "איפה כדאי לקנות שטיח לסלון בישראל?", "מה חנות השטיחים הכי טובה במרכז?". כלול אזור גיאוגרפי אם רלוונטי.
10. ערוצי הפצה — כיצד העסק מגיע ללקוחות שלו (אתר אינטרנט, מכירה ישירה, רשתות חברתיות, מפיצים, שותפים עסקיים, חנויות, B2B פגישות, קטלוגים, פלטפורמות מקוונות וכו')

החזר JSON בלבד בפורמט הבא — ללא טקסט נוסף, ללא markdown:
{
  "coreActivity": "...",
  "businessModel": "B2B|B2C|B2B2C|mixed",
  "products": [{"name":"...","description":"...","targetAudience":"...","priceRange":"..."}],
  "targetAudiences": ["..."],
  "industryTags": ["..."],
  "geographicMarkets": ["..."],
  "competitiveAdvantage": "...",
  "marketPosition": "...",
  "directCompetitors": ["..."],
  "primaryKeywords": ["..."],
  "secondaryKeywords": ["..."],
  "searchQueries": ["..."],
  "geoQueries": ["שאלה קצרה וטבעית 1", "שאלה קצרה וטבעית 2", "שאלה קצרה וטבעית 3"],
  "distributionChannels": ["..."],
  "confidenceScore": 0-100,
  "sourcesUsed": ["..."],
  "generatedAt": "${new Date().toISOString()}"
}`

    // Call xAI Grok with web_search
    const res = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'grok-4-fast-non-reasoning',
        input: [{ role: 'user', content: prompt }],
        tools: [{ type: 'web_search' }],
        include: ['no_inline_citations'],
      }),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      return NextResponse.json({ error: `xAI error: ${res.status} ${errText.slice(0, 200)}` }, { status: 500 })
    }

    const data = await res.json()
    if (!data.output) {
      return NextResponse.json({ error: 'Empty response from xAI' }, { status: 500 })
    }

    const text = data.output
      .filter((item: any) => item.type === 'message')
      .flatMap((item: any) => item.content)
      .filter((c: any) => c.type === 'output_text')
      .map((c: any) => c.text)
      .join('')

    const raw = extractJSON(text)
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return NextResponse.json({ error: 'Could not parse AI response as business profile', raw: text.slice(0, 300) }, { status: 500 })
    }

    const profile = normalizeProfile(raw)

    // Save to companies.business_profile + distribution_channels column
    // Also set next_sync_at = now() + 7 days (first sync after onboarding)
    const nextSync = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    await supabase
      .from('companies')
      .upsert({
        id: user.id,
        business_profile: profile,
        distribution_channels: profile.distributionChannels,
        last_sync_at: new Date().toISOString(),
        next_sync_at: nextSync,
        sync_status: 'idle',
      }, { onConflict: 'id' })

    return NextResponse.json({ success: true, profile })
  } catch (e: any) {
    console.error('analyze-business-deep error:', e?.message)
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
