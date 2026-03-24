export const dynamic = 'force-dynamic'

import { getFullContext } from '@/lib/context'
import { analyzeBusinessForSearch } from '@/lib/analyze-business'
import { NextResponse } from 'next/server'
import type { BusinessProfile } from '@/types/business-profile'

export const maxDuration = 60

const CACHE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

const ENGINES = ['general', 'chatgpt', 'gemini', 'grok', 'perplexity'] as const
type Engine = typeof ENGINES[number]

const ENGINE_PERSONA: Record<Engine, string> = {
  general: 'ענה על השאלה מתוך הידע הכללי שלך',
  chatgpt: 'ענה על השאלה כפי ש-ChatGPT (OpenAI GPT-4) היה עונה על בסיס מאגר הידע שלו',
  gemini: 'ענה על השאלה כפי ש-Google Gemini היה עונה, לפי מה שאתה יודע על הידע שלו',
  grok: 'ענה על השאלה מהידע הייחודי שלך כ-Grok של xAI, עם גישה לנתונים עדכניים',
  perplexity: 'ענה על השאלה כפי ש-Perplexity AI היה עונה, עם דגש על מידע עדכני מהאינטרנט',
}

async function runGeoQuestion(
  question: string,
  companyName: string,
  website: string,
  competitorNames: string[],
  engine: Engine = 'general',
): Promise<{ position: number | null; topResults: string[]; appeared: boolean; results: any[] }> {
  const competitorListText = competitorNames.length > 0
    ? `\nמתחרים ידועים:\n${competitorNames.join(', ')}`
    : ''

  const persona = ENGINE_PERSONA[engine]

  const prompt = `${persona}.

"${question}"

תן רשימה של עד 10 עסקים, לפי סדר חשיבותם.
${competitorListText}

ציין האם ${companyName} (אתר: ${website}) מוזכר ברשימה. (userMentioned: true/false, userPosition: מספר או null)

החזר JSON בלבד:
{"query": "${question}", "results": [{"position": 1, "name": "", "isOwn": false, "isKnownCompetitor": false}], "userMentioned": false, "userPosition": null}

CRITICAL: Output ONLY a raw JSON object. No markdown. Start with { and end with }`

  const response = await fetch('https://api.x.ai/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.XAI_API_KEY}` },
    body: JSON.stringify({
      model: 'grok-4-fast-non-reasoning',
      input: [{ role: 'user', content: prompt }],
    }),
  })

  const data = await response.json()
  if (!response.ok || !data.output) return { position: null, topResults: [], appeared: false, results: [] }

  const text = data.output
    .filter((item: any) => item.type === 'message')
    .flatMap((item: any) => item.content)
    .filter((c: any) => c.type === 'output_text')
    .map((c: any) => c.text)
    .join('')

  const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
  const s = clean.indexOf('{')
  const e = clean.lastIndexOf('}')
  if (s === -1 || e <= s) return { position: null, topResults: [], appeared: false, results: [] }

  let parsed: any = {}
  try { parsed = JSON.parse(clean.slice(s, e + 1)) } catch { return { position: null, topResults: [], appeared: false, results: [] } }

  const results: any[] = (Array.isArray(parsed.results) ? parsed.results : []).slice(0, 10)
  const companyNameLower = companyName.toLowerCase()
  results.forEach((r: any) => {
    const rName = (r.name || '').toLowerCase()
    r.isOwn = companyNameLower.length >= 3 && (rName.includes(companyNameLower) || companyNameLower.includes(rName))
    r.isKnownCompetitor = !r.isOwn && competitorNames.some(n => {
      const nLower = n.toLowerCase()
      return nLower.length >= 3 && (rName.includes(nLower) || nLower.includes(rName))
    })
  })

  // Fix 7: only "appeared" when actually found in the results list with a valid position
  const ownResult = results.find(r => r.isOwn)
  const appeared = !!ownResult && ownResult.position != null
  const userPosition = appeared ? (ownResult!.position ?? null) : null
  const topResults = results.filter(r => !r.isOwn).slice(0, 3).map(r => r.name).filter(Boolean)

  return { position: userPosition, topResults, appeared, results }
}

export async function POST(request: Request) {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const force = new URL(request.url).searchParams.get('force') === 'true'
    if (!force) {
      const { data: company } = await ctx.supabase
        .from('companies').select('geo_ranking').eq('id', ctx.user.id).single()
      const cached = company?.geo_ranking as { fetchedAt?: string } | null
      if (cached?.fetchedAt) {
        const age = Date.now() - new Date(cached.fetchedAt).getTime()
        if (age < CACHE_MS) {
          console.log('[generate-geo-ranking] cache hit, age:', Math.round(age / 3600000), 'h')
          return NextResponse.json({ success: true, ...cached, cached: true })
        }
      }
    }

    const companyName = ctx.company?.name || ''
    const website = ctx.company?.website || ''
    const city = ctx.company?.city || ''
    const industry = ctx.company?.industry || ''
    const overview = ctx.company?.business_overview || ctx.company?.description || ''
    const geoArea: string[] = ctx.company?.geographic_area || []
    const keywords: string[] = ctx.company?.keywords || []
    const scopes: string[] = Array.isArray(ctx.company?.geographic_scope)
      ? ctx.company.geographic_scope
      : [ctx.company?.geographic_scope || 'national']

    const isLocal = scopes.includes('local') || !!(
      geoArea.length > 0 &&
      !geoArea.includes('כל הארץ') &&
      geoArea.length <= 2 &&
      (geoArea.length === 1 || ['מקומי', 'באזור', 'בעיר', city].filter(Boolean).some(k => overview.includes(k)))
    )
    const isInternational = scopes.includes('international')
    const scopeLocation = isLocal ? (city || 'ישראל') : isInternational ? 'ישראל ועולם' : 'ישראל'
    const scope = isLocal ? `חיפוש מקומי — ${scopeLocation}` : isInternational ? 'חיפוש בינלאומי' : 'חיפוש ארצי'

    const businessProfile = (ctx.company?.business_profile ?? null) as BusinessProfile | null
    const keywordString = keywords.slice(0, 5).join(', ')
    const coreActivityDesc = businessProfile?.coreActivity || industry
    const fallbackQuestion = isLocal
      ? `מי הם העסקים המובילים בתחום ${coreActivityDesc} ב${scopeLocation}?`
      : `מי הם העסקים המובילים בתחום ${coreActivityDesc}${keywordString ? ` (${keywordString})` : ''} בישראל?`

    const businessAnalysis = await analyzeBusinessForSearch(overview, city, isLocal, scopeLocation)
    const primaryQuestion = businessAnalysis?.ai_question || fallbackQuestion

    const savedCompetitors: any[] = ctx.competitors || []
    const competitorNames = savedCompetitors.map((c: any) => c.name).filter(Boolean).slice(0, 10)

    // Run all 5 engines in parallel on the primary question
    const engineResults = await Promise.all(
      ENGINES.map(engine => runGeoQuestion(primaryQuestion, companyName, website, competitorNames, engine))
    )

    const engines: Record<string, { results: any[]; appeared: boolean; position: number | null; topResults: string[] }> = {}
    ENGINES.forEach((engine, i) => {
      engines[engine] = {
        results: engineResults[i].results,
        appeared: engineResults[i].appeared,
        position: engineResults[i].position,
        topResults: engineResults[i].topResults,
      }
    })

    // Primary (general) for backward-compat fields
    const primary = engineResults[0]

    // Recommendations via second call
    const contextLine = businessAnalysis?.what_business_does
      ? `בהתחשב בכך ש${companyName} ${businessAnalysis.what_business_does}`
      : `בהתחשב בתחום "${industry}"`
    const recsPrompt = `כתוב 3 המלצות ספציפיות כיצד ${companyName} יכול לשפר את הנוכחות שלו במנועי AI כמו ChatGPT, Grok, Gemini ו-Perplexity, ${contextLine}. החזר JSON בלבד: {"recommendations": ["", "", ""]}. No markdown.`
    let recommendations: string[] = []
    try {
      const recsRes = await fetch('https://api.x.ai/v1/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.XAI_API_KEY}` },
        body: JSON.stringify({ model: 'grok-4-fast-non-reasoning', input: [{ role: 'user', content: recsPrompt }] }),
      })
      const recsData = await recsRes.json()
      const recsText = (recsData.output || [])
        .filter((i: any) => i.type === 'message').flatMap((i: any) => i.content)
        .filter((c: any) => c.type === 'output_text').map((c: any) => c.text).join('')
      const recsClean = recsText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
      const rs = recsClean.indexOf('{'); const re = recsClean.lastIndexOf('}')
      if (rs !== -1 && re > rs) {
        const recsParsed = JSON.parse(recsClean.slice(rs, re + 1))
        recommendations = Array.isArray(recsParsed.recommendations) ? recsParsed.recommendations.slice(0, 3) : []
      }
    } catch { /* fallback to empty */ }

    const result = {
      query: primaryQuestion,
      // Backward-compat top-level fields
      results: primary.results,
      userMentioned: primary.appeared,
      userPosition: primary.position,
      // New engine-based structure
      engines,
      recommendations,
      isLocal,
      scope,
      what_business_does: businessAnalysis?.what_business_does || '',
      fetchedAt: new Date().toISOString(),
    }

    await ctx.supabase.from('companies').update({ geo_ranking: result }).eq('id', ctx.user.id)

    return NextResponse.json({ success: true, ...result, businessAnalysis })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
