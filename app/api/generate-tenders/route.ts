export const dynamic = 'force-dynamic'

import { getFullContext } from '@/lib/context'
import { callModelTwoStage } from '@/lib/call-model'
import { resolveDateVars } from '@/lib/resolve-prompt-vars'
import { NextResponse } from 'next/server'
import type { BusinessProfile } from '@/types/business-profile'

export const maxDuration = 60

const CACHE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function isValidDate(d: string | null | undefined): boolean {
  return !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d))
}

function isValidTenderUrl(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url)
    const isIL = hostname.endsWith('.gov.il') || hostname.endsWith('.org.il') ||
                 hostname.endsWith('.co.il') || hostname.endsWith('.ac.il') ||
                 hostname.endsWith('.muni.il')
    if (!isIL) return false
    const lower = pathname.toLowerCase()
    if (lower.endsWith('.pdf') || lower.endsWith('.doc') || lower.endsWith('.docx')) return false
    const path = pathname.replace(/\/$/, '')
    if (!path || path === '') return false
    return true
  } catch {
    return false
  }
}

export async function POST(request: Request) {
  const steps: Record<string, any> = {}
  try {
    steps.context = 'starting'
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized', steps }, { status: 401 })
    steps.context = { ok: true, company: ctx.company?.name }

    const force = new URL(request.url).searchParams.get('force') === 'true'
    if (!force) {
      const { data: latest } = await ctx.supabase
        .from('tenders').select('created_at').eq('company_id', ctx.user.id)
        .order('created_at', { ascending: false }).limit(1).single()
      if (latest?.created_at) {
        const age = Date.now() - new Date(latest.created_at).getTime()
        if (age < CACHE_MS) {
          console.log('[generate-tenders] cache hit, age:', Math.round(age / 3600000), 'h')
          return NextResponse.json({ success: true, cached: true })
        }
      }
    }

    const today = new Date().toISOString().split('T')[0]

    // ── AI path: use active prompt from prompt_versions if available ──────
    const { data: activePrompt } = await ctx.supabase
      .from('prompt_versions')
      .select('prompt, model_provider, model_name')
      .eq('module', 'tenders')
      .eq('is_active', true)
      .maybeSingle()

    if (activePrompt) {
      steps.aiPath = { provider: activePrompt.model_provider, model: activePrompt.model_name }
      const bp = (ctx.company?.business_profile ?? null) as BusinessProfile | null
      const keywords: string[] = ctx.company?.keywords || []
      const coreActivity = bp?.coreActivity || ctx.company?.description || ctx.company?.industry || ''
      const products = bp?.products?.map((p: any) => p.name).join(', ') || keywords.slice(0, 3).join(', ') || ''
      const companyName = ctx.company?.name || ''
      const industry = ctx.company?.industry || coreActivity
      const targetAudience = (bp?.targetAudiences || ctx.company?.target_customers || []).join(', ')
      const competitorNames = (ctx.competitors || []).map((c: any) => c.name).join(', ')

      const companyContext = `הקשר חברה:
שם: ${companyName}
תחום: ${industry}
פעילות עיקרית: ${coreActivity}
מוצרים: ${products}
מילות מפתח: ${keywords.join(', ')}
קהל יעד: ${targetAudience}
מתחרים: ${competitorNames}
---
`
      const resolvedPrompt = activePrompt.prompt
        .replace(/\{\{company_name\}\}/g, companyName)
        .replace(/\{\{industry\}\}/g, industry)
        .replace(/\{\{core_activity\}\}/g, coreActivity)
        .replace(/\{\{products\}\}/g, products)
        .replace(/\{\{keywords\}\}/g, keywords.join(', '))
        .replace(/\{\{website\}\}/g, ctx.company?.website || '')
        .replace(/\{\{target_audience\}\}/g, targetAudience)
        .replace(/\{\{competitors\}\}/g, competitorNames)

      const finalPrompt = resolveDateVars(companyContext + resolvedPrompt)

      try {
        // Two-stage pipeline: Gemini finds content → xAI finds URLs
        const rawText = await callModelTwoStage(finalPrompt, ctx.company)
        steps.aiResult = { chars: rawText.length, pipeline: 'gemini+xai' }

        let tenderItems: any[] = []
        try {
          const clean = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
          const parsed = JSON.parse(clean)
          tenderItems = Array.isArray(parsed) ? parsed : (parsed.tenders || [])
        } catch {
          try {
            const match = rawText.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
            if (match) {
              const parsed = JSON.parse(match[0])
              tenderItems = Array.isArray(parsed) ? parsed : (parsed.tenders || [])
            }
          } catch {}
        }

        steps.aiParsed = { count: tenderItems.length }

        if (tenderItems.length > 0) {
          // Filter: deadline in future
          tenderItems = tenderItems.filter((t: any) => !t.deadline || t.deadline > today)
          // URL validation (relaxed — just require http)
          tenderItems = tenderItems.filter((t: any) => !t.url || t.url.startsWith('http'))

          await ctx.supabase.from('tenders').delete().eq('company_id', ctx.user.id)
          const { data: saved, error: insertError } = await ctx.supabase.from('tenders').insert(
            tenderItems.map((t: any) => ({
              title: t.title || '',
              organization: t.publisher || t.organization || t.ministry || '',
              deadline: isValidDate(t.deadline) ? t.deadline : null,
              budget: t.budget || 'לא צוין',
              description: t.description || '',
              link: t.url || '',
              relevance_score: 75,
              company_id: ctx.user.id,
            }))
          ).select()
          if (insertError) {
            steps.db = { ok: false, error: insertError.message }
            return NextResponse.json({ error: 'DB insert failed', steps }, { status: 500 })
          }
          steps.db = { ok: true, saved: saved?.length }
          return NextResponse.json({ success: true, tenders: saved, count: saved?.length || 0, steps })
        }
        steps.aiPath = { ...steps.aiPath, fallback: 'ai returned 0 items' }
      } catch (aiErr: any) {
        console.warn('[generate-tenders] AI path failed, falling back to xAI:', aiErr?.message)
        steps.aiPath = { ...steps.aiPath, fallback: aiErr?.message }
      }
    }

    // ── Fallback: hardcoded xAI call ──────────────────────────────────────
    const businessOverview = ctx.company?.business_overview || ctx.company?.description || ''
    const keywords = (ctx.companyProfile?.keywords || []).join(', ')
    const industry = ctx.companyProfile?.industry || ''
    const geoContext = ctx.geoContext || 'העסק פעיל בכל רחבי ישראל.'

    const businessProfile = (ctx.company?.business_profile ?? null) as BusinessProfile | null
    const industryTags = businessProfile?.industryTags?.join(', ') || industry
    const targetAudiences = businessProfile?.targetAudiences?.join(', ') || ''
    const geoMarkets = businessProfile?.geographicMarkets?.join(', ') || ''

    const prompt = `אתה מומחה למכרזים ממשלתיים בישראל.

פרטי העסק:
- תיאור: ${businessOverview}
- מילות מפתח: ${keywords}
- תחום ותגיות תעשייה: ${industryTags}
${targetAudiences ? `- קהלי יעד: ${targetAudiences}` : ''}
${geoMarkets ? `- שווקים גיאוגרפיים: ${geoMarkets}` : ''}
- היקף גיאוגרפי: ${geoContext}

חפש מכרזים ממשלתיים פתוחים בישראל שרלוונטיים לעסק זה.
חפש באתרים: mr.gov.il, gov.il, mof.gov.il, health.gov.il ואתרים ממשלתיים אחרים.

דרישות קריטיות לכל מכרז:
- תאריך הגשה חייב להיות בעתיד (אחרי ${today})
- הקישור חייב להיות לדף HTML של המכרז הספציפי — לא PDF, לא דף ראשי
- מספר מכרז אמיתי (פורמט: XXXX/XXXX או דומה)
- שם משרד/גוף ממשלתי אמיתי

לכל מכרז תן relevance_score 0-100 לפי רלוונטיות לתחום העסק.

החזר JSON בלבד:
[{
  "title": "",
  "tender_number": "",
  "ministry": "",
  "deadline": "YYYY-MM-DD",
  "publish_date": "YYYY-MM-DD",
  "url": "",
  "description": "",
  "relevance_score": 0
}]

CRITICAL: Output ONLY a raw JSON array. No markdown, no explanation. Start with [ and end with ]`

    steps.ai = { status: 'starting' }
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
      steps.ai = { error: data }
      return NextResponse.json({ error: 'xAI API error', steps }, { status: 500 })
    }

    const text = data.output
      .filter((item: any) => item.type === 'message')
      .flatMap((item: any) => item.content)
      .filter((c: any) => c.type === 'output_text')
      .map((c: any) => c.text)
      .join('')

    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    const start = clean.indexOf('[')
    const end = clean.lastIndexOf(']')
    let list: any[] = start !== -1 && end > start ? JSON.parse(clean.slice(start, end + 1)) : []

    steps.ai = { ok: true, raw: list.length, titles: list.map((t: any) => t.title) }

    list = list.filter((t: any) => (t.relevance_score ?? 0) >= 75)
    steps.afterRelevance = list.length

    list = list.filter((t: any) => !t.deadline || t.deadline > today)
    steps.afterDeadline = list.length

    list = list.filter((t: any) => isValidTenderUrl(t.url || ''))
    steps.afterUrl = list.length

    const seenUrls = new Set<string>()
    list = list.filter((t: any) => {
      const url = (t.url || '').toLowerCase()
      if (!url || seenUrls.has(url)) return false
      seenUrls.add(url)
      return true
    })
    steps.afterDedup = list.length

    steps.db = 'starting'
    await ctx.supabase.from('tenders').delete().eq('company_id', ctx.user.id)

    if (list.length === 0) {
      return NextResponse.json({
        success: true,
        tenders: [],
        count: 0,
        message: 'לא נמצאו מכרזים רלוונטיים',
        steps,
      })
    }

    const { data: saved, error: insertError } = await ctx.supabase.from('tenders').insert(
      list.map((t: any) => ({
        title: t.title || '',
        organization: t.ministry || '',
        deadline: isValidDate(t.deadline) ? t.deadline : null,
        budget: 'לא צוין',
        description: t.description || '',
        link: t.url || '',
        relevance_score: typeof t.relevance_score === 'number' ? Math.min(100, t.relevance_score) : 75,
        company_id: ctx.user.id,
      }))
    ).select()

    if (insertError) {
      steps.db = { ok: false, error: insertError.message, code: insertError.code }
      return NextResponse.json({ error: 'DB insert failed', steps }, { status: 500 })
    }
    steps.db = { ok: true, saved: saved?.length }

    return NextResponse.json({ success: true, tenders: saved, count: saved?.length || 0, steps })
  } catch (e: any) {
    console.error('generate-tenders error:', e?.message)
    return NextResponse.json({ error: e?.message, stack: e?.stack?.split('\n').slice(0, 4), steps }, { status: 500 })
  }
}
