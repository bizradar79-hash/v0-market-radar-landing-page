import { getFullContext } from '@/lib/context'
import { analyzeBusinessForSearch } from '@/lib/analyze-business'
import { NextResponse } from 'next/server'

export const maxDuration = 60

const CACHE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

function isLocalBusiness(overview: string, city: string, geoArea: string[]): boolean {
  if (!geoArea || geoArea.length === 0) return false
  if (geoArea.includes('כל הארץ') || geoArea.length > 2) return false
  const localKeywords = ['מקומי', 'באזור', 'בעיר', city].filter(Boolean)
  return geoArea.length <= 1 || localKeywords.some(k => overview.includes(k))
}

export async function POST(request: Request) {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const force = new URL(request.url).searchParams.get('force') === 'true'
    if (!force) {
      const { data: company } = await ctx.supabase
        .from('companies').select('seo_ranking').eq('id', ctx.user.id).single()
      const cached = company?.seo_ranking as { fetchedAt?: string } | null
      if (cached?.fetchedAt) {
        const age = Date.now() - new Date(cached.fetchedAt).getTime()
        if (age < CACHE_MS) {
          console.log('[generate-seo-ranking] cache hit, age:', Math.round(age / 3600000), 'h')
          return NextResponse.json({ success: true, ...cached, cached: true })
        }
      }
    }

    const companyName = ctx.company?.name || ''
    const website = ctx.company?.website || ''
    const companyDomain = extractDomain(website)
    const city = ctx.company?.city || ''
    const industry = ctx.company?.industry || ''
    const overview = ctx.company?.business_overview || ctx.company?.description || ''
    const geoArea: string[] = ctx.company?.geographic_area || []
    const keywords: string[] = ctx.company?.keywords || []
    const scopes: string[] = Array.isArray(ctx.company?.geographic_scope)
      ? ctx.company.geographic_scope
      : [ctx.company?.geographic_scope || 'national']

    const isLocal = scopes.includes('local') || isLocalBusiness(overview, city, geoArea)
    const isInternational = scopes.includes('international')
    const scopeLocation = isLocal ? (city || 'ישראל') : isInternational ? 'ישראל ועולם' : 'ישראל'
    const scope = isLocal ? `חיפוש מקומי — ${scopeLocation}` : isInternational ? 'חיפוש בינלאומי' : 'חיפוש ארצי'

    // ── Step 1: Business understanding ──────────────────────────────────────
    // Ask Grok to read the business overview and produce an optimal search query
    const fallbackQuery = [industry, scopeLocation, keywords.slice(0, 3).join(' ')].filter(Boolean).join(' ')
    const businessAnalysis = await analyzeBusinessForSearch(overview, city, isLocal, scopeLocation)
    const searchQuery = businessAnalysis?.google_query || fallbackQuery

    // ── Step 2: SEO search ───────────────────────────────────────────────────
    const savedCompetitors: any[] = ctx.competitors || []
    const competitorWebsites = savedCompetitors
      .map((c: any) => c.website).filter(Boolean).slice(0, 10)

    const competitorListText = competitorWebsites.length > 0
      ? `\nאתרי מתחרים ידועים לסימון (isKnownCompetitor: true אם ה-URL שייך לאחד מהם):\n${competitorWebsites.join('\n')}`
      : ''

    const localPackNote = isLocal
      ? `\nשים לב: זהו חיפוש מקומי. כלול גם תוצאות מ-Google Maps / Local Pack אם מופיעות, וסמן אותן ב-title עם "(Google Maps)" בסוף.`
      : ''

    const prompt = `אתה מומחה SEO ישראלי. השתמש בכלי web_search כדי לחפש בגוגל את השאילתה הבאה ורשום את 10 התוצאות האורגניות הראשונות בדיוק לפי סדרן בדף התוצאות:${localPackNote}

שאילתת חיפוש: "${searchQuery}"

פרטי העסק שלנו:
- שם: ${companyName}
- אתר: ${website}
- דומיין: ${companyDomain}
${competitorListText}

CRITICAL: דווח אך ורק על URLs שמופיעים בפועל בתוצאות החיפוש שקיבלת מ-web_search. אסור לבדות URLs או כותרות שלא ראית בתוצאות האמיתיות.

לכל תוצאת חיפוש אמיתית ציין:
- position: מיקום (1-10)
- name: שם העסק או הדף
- url: ה-URL המדויק שמופיע בגוגל
- title: כותרת הדף כפי שמופיעה בגוגל
- isOwn: true רק אם הדומיין של ה-URL מכיל "${companyDomain}", אחרת false
- isKnownCompetitor: true אם ה-URL שייך לאחד מאתרי המתחרים הידועים, אחרת false

לאחר הרשימה, כתוב 3 המלצות ספציפיות לשיפור דירוג SEO של ${companyName} בהתבסס על התוצאות שמצאת.

החזר JSON בלבד:
{"query": "${searchQuery}", "results": [{"position": 1, "name": "", "url": "", "title": "", "isOwn": false, "isKnownCompetitor": false}], "recommendations": ["", "", ""]}

CRITICAL: Output ONLY a raw JSON object. No markdown. Start with { and end with }`

    const response = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'grok-4-fast-non-reasoning',
        input: [{ role: 'user', content: prompt }],
        tools: [{ type: 'web_search' }],
      }),
    })

    const data = await response.json()
    if (!response.ok || !data.output) {
      return NextResponse.json({ error: 'xAI API error', detail: data }, { status: 500 })
    }

    const text = data.output
      .filter((item: any) => item.type === 'message')
      .flatMap((item: any) => item.content)
      .filter((c: any) => c.type === 'output_text')
      .map((c: any) => c.text)
      .join('')

    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    const start = clean.indexOf('{')
    const end = clean.lastIndexOf('}')
    if (start === -1 || end <= start) {
      return NextResponse.json({ error: 'Failed to parse response', raw: text.slice(0, 500) }, { status: 500 })
    }

    let parsed: any = {}
    try { parsed = JSON.parse(clean.slice(start, end + 1)) } catch {
      return NextResponse.json({ error: 'JSON parse error', raw: text.slice(0, 500) }, { status: 500 })
    }

    // Post-process: enforce isOwn and isKnownCompetitor by domain matching
    const results: any[] = (Array.isArray(parsed.results) ? parsed.results : []).slice(0, 10)
    const competitorDomains = competitorWebsites.map(extractDomain).filter(Boolean)

    results.forEach((r: any) => {
      const rDomain = extractDomain(r.url || '')
      r.isOwn = companyDomain ? rDomain === companyDomain || rDomain.includes(companyDomain) : false
      r.isKnownCompetitor = competitorDomains.some(d => d && (rDomain === d || rDomain.includes(d)))
    })

    const result = {
      query: searchQuery,
      results,
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.slice(0, 3) : [],
      isLocal,
      scope,
      what_business_does: businessAnalysis?.what_business_does || '',
      fetchedAt: new Date().toISOString(),
    }

    await ctx.supabase.from('companies').update({ seo_ranking: result }).eq('id', ctx.user.id)

    return NextResponse.json({ success: true, ...result, businessAnalysis })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
