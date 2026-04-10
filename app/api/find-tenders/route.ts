export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { getFullContext } from '@/lib/context'
import { scrapeMrGov } from '@/lib/tenders-scraper'
import { NextResponse } from 'next/server'
import type { BusinessProfile } from '@/types/business-profile'

const CACHE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function isValidDate(d: string | null | undefined): boolean {
  return !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d))
}

// Convert DD/MM/YYYY → YYYY-MM-DD (returns null if invalid)
function parseDeadline(raw: string): string | null {
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  const iso = `${m[3]}-${m[2]}-${m[1]}`
  return isValidDate(iso) ? iso : null
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
          console.log('[find-tenders] cache hit, age:', Math.round(age / 3600000), 'h')
          return NextResponse.json({ success: true, cached: true })
        }
      }
    }

    // ── Build keywords from company profile ───────────────────────────────
    const bp = (ctx.company?.business_profile ?? null) as BusinessProfile | null
    const keywords: string[] = (
      ctx.company?.keywords?.length ? ctx.company.keywords :
      bp?.primaryKeywords?.length ? bp.primaryKeywords :
      ctx.company?.industry ? [ctx.company.industry] : []
    ).slice(0, 8)

    if (keywords.length === 0) {
      return NextResponse.json({ success: true, tenders: [], count: 0, message: 'אין מילות מפתח', steps })
    }

    steps.keywords = keywords

    // ── Stage 1: Scrape mr.gov.il ─────────────────────────────────────────
    steps.scraper = 'starting'
    const scraped = await scrapeMrGov(keywords)
    steps.scraper = { found: scraped.length }
    console.log(`[find-tenders] scraped ${scraped.length} tenders`)

    if (scraped.length === 0) {
      return NextResponse.json({ success: true, tenders: [], count: 0, message: 'לא נמצאו מכרזים בסריקה', steps })
    }

    // ── Stage 2: xAI relevance scoring (no web_search) ───────────────────
    const companyDesc = bp?.coreActivity || ctx.company?.description || ctx.company?.industry || ''
    const companyName = ctx.company?.name || ''

    const scoringPrompt = `אתה מומחה ניתוח מכרזים.
חברה: ${companyName}
תחום פעילות: ${companyDesc}
מילות מפתח: ${keywords.join(', ')}

להלן רשימת מכרזים שנמצאו בסריקה של mr.gov.il.
לכל מכרז תן ציון רלוונטיות מ-1 עד 10 (10 = רלוונטי מאוד לתחום החברה).

מכרזים:
${scraped.map((t, i) => `${i + 1}. כותרת: ${t.title}\n   מפרסם: ${t.publisher}\n   מספר הליך: ${t.procedure_number}`).join('\n\n')}

החזר JSON בלבד:
[{"index": 1, "relevance": 8}, {"index": 2, "relevance": 3}, ...]

CRITICAL: Output ONLY a raw JSON array. No markdown, no explanation.`

    steps.scoring = 'starting'
    let scores: Array<{ index: number; relevance: number }> = []

    try {
      const xaiRes = await fetch('https://api.x.ai/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'grok-4-fast-non-reasoning',
          input: scoringPrompt,
          // No web_search — pure reasoning
        }),
      })

      if (xaiRes.ok) {
        const xaiData = await xaiRes.json()
        const xaiText = xaiData.output
          ?.filter((b: any) => b.type === 'message')
          .flatMap((b: any) => b.content)
          .filter((c: any) => c.type === 'output_text')
          .map((c: any) => c.text)
          .join('') || ''

        try {
          const clean = xaiText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
          const start = clean.indexOf('[')
          const end = clean.lastIndexOf(']')
          if (start !== -1 && end > start) {
            scores = JSON.parse(clean.slice(start, end + 1))
          }
        } catch (e) {
          console.warn('[find-tenders] scoring parse failed:', e)
        }
      }
    } catch (e: any) {
      console.warn('[find-tenders] xAI scoring failed:', e?.message)
    }

    steps.scoring = { scoresReturned: scores.length }

    // Build score map (1-indexed)
    const scoreMap = new Map<number, number>()
    for (const s of scores) {
      if (typeof s.index === 'number' && typeof s.relevance === 'number') {
        scoreMap.set(s.index, s.relevance)
      }
    }

    // ── Merge scraper + scores ─────────────────────────────────────────────
    const today = new Date().toISOString().split('T')[0]

    let merged = scraped.map((t, i) => ({
      ...t,
      relevance: scoreMap.get(i + 1) ?? 5, // default 5 if scoring failed
      deadlineIso: parseDeadline(t.deadline),
    }))

    // Filter relevance >= 6 (or keep all if scoring failed / all scored < 6)
    const highRelevance = merged.filter(t => t.relevance >= 6)
    if (highRelevance.length > 0) merged = highRelevance
    // else keep all (scoring may have failed)

    // Sort by deadline ascending (nulls last)
    merged.sort((a, b) => {
      if (!a.deadlineIso && !b.deadlineIso) return 0
      if (!a.deadlineIso) return 1
      if (!b.deadlineIso) return -1
      return a.deadlineIso.localeCompare(b.deadlineIso)
    })

    const top10 = merged.slice(0, 10)
    steps.afterFilter = { kept: top10.length, totalScored: merged.length }

    // ── Save to DB ────────────────────────────────────────────────────────
    await ctx.supabase.from('tenders').delete().eq('company_id', ctx.user.id)

    if (top10.length === 0) {
      return NextResponse.json({ success: true, tenders: [], count: 0, message: 'לא נמצאו מכרזים רלוונטיים', steps })
    }

    const { data: saved, error: insertError } = await ctx.supabase.from('tenders').insert(
      top10.map(t => ({
        title: t.title,
        organization: t.publisher,
        deadline: t.deadlineIso ?? null,
        budget: 'לא צוין',
        description: `מספר הליך: ${t.procedure_number} | סטטוס: ${t.status}`,
        link: t.url,
        relevance_score: Math.round(t.relevance * 10), // 1-10 → 10-100
        company_id: ctx.user.id,
      }))
    ).select()

    if (insertError) {
      steps.db = { ok: false, error: insertError.message }
      return NextResponse.json({ error: 'DB insert failed', steps }, { status: 500 })
    }

    steps.db = { ok: true, saved: saved?.length }
    return NextResponse.json({ success: true, tenders: saved, count: saved?.length || 0, steps })

  } catch (e: any) {
    console.error('[find-tenders] error:', e?.message)
    return NextResponse.json({ error: e?.message, stack: e?.stack?.split('\n').slice(0, 4), steps }, { status: 500 })
  }
}
