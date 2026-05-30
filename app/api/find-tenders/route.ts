export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { getFullContext } from '@/lib/context'
import { scrapeMrGov } from '@/lib/tenders-scraper'
import { getEngineTendersForCompany } from '@/lib/tenders/from-engine'
import { NextResponse } from 'next/server'
import type { BusinessProfile } from '@/types/business-profile'

const CACHE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const TARGET = 12

function isValidDate(d: string | null | undefined): boolean {
  return !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d))
}

function parseDeadline(raw: string): string | null {
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  const iso = `${m[3]}-${m[2]}-${m[1]}`
  return isValidDate(iso) ? iso : null
}

// Normalize a title for dedup comparison
function normTitle(s: string): string {
  return (s || '').toLowerCase().replace(/[^א-תa-z0-9]/g, '').trim()
}

function normUrl(s: string | null): string {
  return (s || '').replace(/\/$/, '').toLowerCase().trim()
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

    // ── Build keywords ────────────────────────────────────────────────────
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

    // ── STAGE 1: Engine pool ──────────────────────────────────────────────
    steps.engine = 'starting'
    const engineTenders = await getEngineTendersForCompany(
      { keywords: ctx.company?.keywords, industry: ctx.company?.industry, business_profile: ctx.company?.business_profile },
      TARGET
    )
    steps.engine = { found: engineTenders.length }

    // ── STAGE 2: AI supplement (only if engine didn't fill TARGET) ────────
    let aiRows: Array<{
      title: string; organization: string; deadline: string | null
      budget: string; description: string; link: string | null
      relevance_score: number; company_id: string
    }> = []

    const gap = TARGET - engineTenders.length

    if (gap > 0) {
      steps.scraper = 'starting'
      const scraped = await scrapeMrGov(keywords)
      steps.scraper = { found: scraped.length }

      if (scraped.length > 0) {
        // xAI relevance scoring
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
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.XAI_API_KEY}` },
            body: JSON.stringify({ model: 'grok-4-fast-non-reasoning', input: scoringPrompt }),
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
              const start = clean.indexOf('['); const end = clean.lastIndexOf(']')
              if (start !== -1 && end > start) scores = JSON.parse(clean.slice(start, end + 1))
            } catch (e) { console.warn('[find-tenders] scoring parse failed:', e) }
          }
        } catch (e: any) { console.warn('[find-tenders] xAI scoring failed:', e?.message) }

        steps.scoring = { scoresReturned: scores.length }

        const scoreMap = new Map<number, number>()
        for (const s of scores) {
          if (typeof s.index === 'number' && typeof s.relevance === 'number') scoreMap.set(s.index, s.relevance)
        }

        let merged = scraped.map((t, i) => ({
          ...t,
          relevance: scoreMap.get(i + 1) ?? 5,
          deadlineIso: parseDeadline(t.deadline),
        }))

        const highRelevance = merged.filter(t => t.relevance >= 6)
        if (highRelevance.length > 0) merged = highRelevance

        merged.sort((a, b) => {
          if (!a.deadlineIso && !b.deadlineIso) return 0
          if (!a.deadlineIso) return 1
          if (!b.deadlineIso) return -1
          return a.deadlineIso.localeCompare(b.deadlineIso)
        })

        aiRows = merged.slice(0, gap).map(t => ({
          title: t.title,
          organization: t.publisher,
          deadline: t.deadlineIso ?? null,
          budget: 'לא צוין',
          description: `[src:ai]מספר הליך: ${t.procedure_number} | סטטוס: ${t.status}`,
          link: t.url,
          relevance_score: Math.round(t.relevance * 10),
          company_id: ctx.user.id,
        }))
      }
    }

    steps.aiRows = aiRows.length

    // ── Merge: engine first, then AI, dedup ───────────────────────────────
    const engineRows = engineTenders.map(t => ({
      title: t.title,
      organization: t.publisher,
      deadline: t.deadline ?? null,
      budget: t.budget || 'לא צוין',
      description: `[src:engine]${t.description || ''}`,
      link: t.url,
      relevance_score: t.relevance_score,
      company_id: ctx.user.id,
    }))

    const engineTitleSet = new Set(engineRows.map(r => normTitle(r.title)))
    const engineUrlSet = new Set(engineRows.map(r => normUrl(r.link)))

    const deduped = aiRows.filter(r =>
      !engineTitleSet.has(normTitle(r.title)) &&
      !(r.link && engineUrlSet.has(normUrl(r.link)))
    )

    const allRows = [...engineRows, ...deduped]

    if (allRows.length === 0) {
      return NextResponse.json({ success: true, tenders: [], count: 0, message: 'לא נמצאו מכרזים רלוונטיים', steps })
    }

    // ── Save to DB ────────────────────────────────────────────────────────
    await ctx.supabase.from('tenders').delete().eq('company_id', ctx.user.id)

    const { data: saved, error: insertError } = await ctx.supabase.from('tenders').insert(allRows).select()

    if (insertError) {
      steps.db = { ok: false, error: insertError.message }
      return NextResponse.json({ error: 'DB insert failed', steps }, { status: 500 })
    }

    steps.db = { ok: true, saved: saved?.length, engineCount: engineRows.length, aiCount: deduped.length }
    return NextResponse.json({ success: true, tenders: saved, count: saved?.length || 0, steps })

  } catch (e: any) {
    console.error('[find-tenders] error:', e?.message)
    return NextResponse.json({ error: e?.message, stack: e?.stack?.split('\n').slice(0, 4), steps }, { status: 500 })
  }
}
