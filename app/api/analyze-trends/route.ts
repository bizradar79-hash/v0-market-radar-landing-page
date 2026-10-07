export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'
import { analyzeWithAI } from '@/lib/ai'
import { TRENDS_SYSTEM_PROMPT } from '@/lib/trends-system-prompt'
import { validateTrendsOutput } from '@/lib/trends-validator'

const CACHE_MS = 7 * 24 * 60 * 60 * 1000
// Groq (llama-3.3-70b-versatile) is no longer accessible — use the shared
// Gemini → xAI chain. The trends system prompt is prepended to the message.
async function callAI(systemPrompt: string, userMessage: string): Promise<any> {
  return analyzeWithAI(`${systemPrompt}\n\n${userMessage}`)
}

export async function POST(request: Request) {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const force = new URL(request.url).searchParams.get('force') === 'true' || body.force === true

    if (!force) {
      const { data: company } = await ctx.supabase
        .from('companies').select('trends_analysis').eq('id', ctx.user.id).single()
      const cached = company?.trends_analysis as { fetchedAt?: string } | null
      if (cached?.fetchedAt) {
        const age = Date.now() - new Date(cached.fetchedAt).getTime()
        if (age < CACHE_MS) return NextResponse.json({ success: true, ...cached, cached: true })
      }
    }

    // Gather data from DB
    const { data: companyData } = await ctx.supabase
      .from('companies')
      .select('keywords, keyword_trends, review_analysis, geo_data, business_profile')
      .eq('id', ctx.user.id)
      .single()

    const keywords: string[] = companyData?.keywords || []
    const keywordTrends = (companyData?.keyword_trends || {}) as Record<string, any>
    const reviewAnalysis = companyData?.review_analysis as any
    const geoData = companyData?.geo_data as any
    const businessProfile = companyData?.business_profile as any

    // Build search_data from stored keyword trends
    const search_data: { keyword: string; trend?: string; recent_phrases?: string[] }[] =
      keywords.map(kw => {
        const kwData = keywordTrends[kw]
        const trends = kwData?.israel || kwData?.trends || []
        return {
          keyword: kw,
          trend: trends[0]?.trend || 'unknown',
          recent_phrases: trends.slice(0, 3).map((t: any) => t.phrase).filter(Boolean),
        }
      })

    // Fallback: use business profile keywords if no stored keyword data
    if (search_data.length === 0 && businessProfile?.primaryKeywords?.length) {
      businessProfile.primaryKeywords.slice(0, 5).forEach((kw: string) => {
        search_data.push({ keyword: kw, trend: 'unknown' })
      })
    }

    // Build social_reviews from stored review analysis + geo reviews
    const social_reviews: string[] = []
    if (reviewAnalysis) {
      if (Array.isArray(reviewAnalysis.positiveThemes))
        reviewAnalysis.positiveThemes.forEach((t: string) => social_reviews.push(`חיובי: ${t}`))
      if (Array.isArray(reviewAnalysis.negativeThemes))
        reviewAnalysis.negativeThemes.forEach((t: string) => social_reviews.push(`שלילי: ${t}`))
      if (Array.isArray(reviewAnalysis.recurringComplaints))
        reviewAnalysis.recurringComplaints.forEach((t: string) => social_reviews.push(`תלונה חוזרת: ${t}`))
      if (reviewAnalysis.summary) social_reviews.push(reviewAnalysis.summary)
    }
    if (Array.isArray(geoData?.reviews)) {
      geoData.reviews.slice(0, 5).forEach((r: any) => {
        if (r.text) social_reviews.push(`דירוג ${r.rating}/5: ${r.text.slice(0, 200)}`)
      })
    }

    // Build competitors from competitors table
    const { data: competitorRows } = await ctx.supabase
      .from('competitors').select('name, services, positioning').eq('company_id', ctx.user.id)
    const competitors = (competitorRows || []).map((c: any) => ({
      name: c.name,
      products: [c.services, c.positioning].filter(Boolean),
    }))

    // Final input — body overrides allowed
    const input = {
      search_data: body.search_data ?? search_data,
      social_reviews: body.social_reviews ?? social_reviews,
      competitors: body.competitors ?? competitors,
      manual_keywords: body.manual_keywords ?? (keywords.length > 0 ? keywords : undefined),
    }

    const userMessage = `Analyze the following market intelligence data for an Israeli business.

BUSINESS CONTEXT: ${ctx.company?.name || ''} — ${ctx.company?.business_overview || ctx.company?.description || ''}
INDUSTRY: ${ctx.company?.industry || ''}

INPUT DATA:
${JSON.stringify(input, null, 2)}

Return ONLY the JSON structure specified in your system prompt. Every claim must be traceable to the INPUT DATA above.`

    // First attempt
    let parsed = await callAI(TRENDS_SYSTEM_PROMPT, userMessage)
    let validation = validateTrendsOutput(parsed, input)

    // Retry once if hallucination flags found
    if (validation.hallucination_flags.length > 0) {
      const stricterMessage = `${userMessage}

RETRY — previous attempt had hallucination flags:
${validation.hallucination_flags.map((f) => `- ${f.field}: ${f.reason}`).join('\n')}

Be stricter — only use data explicitly present in the INPUT DATA above. Do not invent any numbers, quotes, or keywords not present there.`

      try {
        const retried = await callAI(TRENDS_SYSTEM_PROMPT, stricterMessage)
        const retriedValidation = validateTrendsOutput(retried, input)
        // Use retry result if it has fewer flags
        if (retriedValidation.hallucination_flags.length <= validation.hallucination_flags.length) {
          parsed = retried
          validation = retriedValidation
        }
      } catch {
        // keep original if retry fails
      }
    }

    const result = {
      ...parsed,
      fetchedAt: new Date().toISOString(),
      validation,
    }

    await ctx.supabase.from('companies').update({ trends_analysis: result }).eq('id', ctx.user.id)

    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
