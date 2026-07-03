export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { getFullContext } from '@/lib/context'
import { scrapeMrGov } from '@/lib/tenders-scraper'
import { getEngineTendersForCompany } from '@/lib/tenders/from-engine'
import { validateUrl } from '@/lib/ai'
import { filterInsertRows } from '@/lib/admin/hidden'
import { ScanCostCollector } from '@/lib/scan/cost-tracker'
import { NextResponse } from 'next/server'
import type { BusinessProfile } from '@/types/business-profile'

const CACHE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
// Cap the number of tenders we keep per client. Ranked high-to-low by relevance,
// so this keeps the best 6 rather than padding with weak matches. Env-tunable.
const TARGET = Number(process.env.TENDERS_MAX) || 6

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
  let cost = new ScanCostCollector(null, 'tenders')
  try {
    steps.context = 'starting'
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized', steps }, { status: 401 })
    steps.context = { ok: true, company: ctx.company?.name }

    cost = new ScanCostCollector(ctx.user.id, 'tenders')

    const force = new URL(request.url).searchParams.get('force') === 'true'
    if (!force) {
      const { data: latest } = await ctx.supabase
        .from('tenders').select('created_at').eq('company_id', ctx.user.id)
        .order('created_at', { ascending: false }).limit(1).single()
      if (latest?.created_at) {
        const age = Date.now() - new Date(latest.created_at).getTime()
        if (age < CACHE_MS) {
          console.log('[find-tenders] cache hit, age:', Math.round(age / 3600000), 'h')
          await cost.flush()
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
      await cost.flush()
      return NextResponse.json({ success: true, tenders: [], count: 0, message: 'אין מילות מפתח', steps })
    }

    steps.keywords = keywords

    // ── STAGE 1: Engine pool ──────────────────────────────────────────────
    steps.engine = 'starting'
    const engineResult = await getEngineTendersForCompany(
      { keywords: ctx.company?.keywords, industry: ctx.company?.industry, business_profile: ctx.company?.business_profile },
      TARGET
    )
    const engineTenders = engineResult.tenders
    steps.engine = { found: engineTenders.length, poolTotal: engineResult.poolTotal, poolActive: engineResult.poolActive }

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

        const t0 = Date.now()
        try {
          const xaiRes = await fetch('https://api.x.ai/v1/responses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.XAI_API_KEY}` },
            body: JSON.stringify({ model: 'grok-4-fast-non-reasoning', input: scoringPrompt }),
          })

          if (xaiRes.ok) {
            const xaiData = await xaiRes.json()
            cost.add({ provider: 'xai', model: 'grok-4-fast-non-reasoning', data: xaiData, ms: Date.now() - t0 })
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
        } catch (e: any) {
          cost.add({ provider: 'xai', model: 'grok-4-fast-non-reasoning', ms: Date.now() - t0 })
          console.warn('[find-tenders] xAI scoring failed:', e?.message)
        }

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

        const candidates = merged.slice(0, gap).map(t => ({
          title: t.title,
          organization: t.publisher,
          deadline: t.deadlineIso ?? null,
          budget: 'לא צוין',
          description: `[src:ai]מספר הליך: ${t.procedure_number} | סטטוס: ${t.status}`,
          link: t.url,
          relevance_score: Math.round(t.relevance * 10),
          company_id: ctx.user.id,
        }))

        // MANDATORY link validation: every AI tender must have a real, resolvable
        // http(s) URL. Drop any that is empty or fails to resolve — fewer real
        // tenders beats fabricated ones.
        const validated = await Promise.all(
          candidates.map(async (row) => {
            const url = (row.link || '').trim()
            if (!/^https?:\/\//i.test(url)) return null
            const ok = await validateUrl(url)
            return ok ? { ...row, link: url } : null
          })
        )
        aiRows = validated.filter((r): r is NonNullable<typeof r> => r !== null)
        steps.aiValidated = { candidates: candidates.length, passed: aiRows.length }
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

    // Hard guard: never persist a tender without a real http(s) link.
    // Then rank high-to-low by relevance (tiebreak nearest deadline) and cap at
    // TARGET so the best matches surface first and weak ones never pad the list.
    const allRows = [...engineRows, ...deduped]
      .filter(r => /^https?:\/\//i.test((r.link || '').trim()))
      .sort((a, b) => {
        if ((b.relevance_score ?? 0) !== (a.relevance_score ?? 0)) return (b.relevance_score ?? 0) - (a.relevance_score ?? 0)
        if (!a.deadline && !b.deadline) return 0
        if (!a.deadline) return 1
        if (!b.deadline) return -1
        return a.deadline.localeCompare(b.deadline)
      })
      .slice(0, TARGET)

    console.log(
      '[tenders] pool_total=', engineResult.poolTotal,
      'pool_active=', engineResult.poolActive,
      'matched_engine=', engineTenders.length,
      'ai=', aiRows.length,
      'saved=', allRows.length,
    )

    if (allRows.length === 0) {
      await cost.flush()
      return NextResponse.json({ success: true, tenders: [], count: 0, message: 'לא נמצאו מכרזים רלוונטיים', steps })
    }

    // ── Save to DB ────────────────────────────────────────────────────────
    // Respect admin-hidden items: a hidden tender must never be re-added.
    const rowsToSave = await filterInsertRows(ctx.user.id, 'tender', allRows, (r: any) => r.title)
    await ctx.supabase.from('tenders').delete().eq('company_id', ctx.user.id)

    if (rowsToSave.length === 0) {
      await cost.flush()
      return NextResponse.json({ success: true, tenders: [], count: 0, message: 'לא נמצאו מכרזים רלוונטיים', steps })
    }

    const { data: saved, error: insertError } = await ctx.supabase.from('tenders').insert(rowsToSave).select()

    if (insertError) {
      steps.db = { ok: false, error: insertError.message }
      await cost.flush()
      return NextResponse.json({ error: 'DB insert failed', steps }, { status: 500 })
    }

    steps.db = { ok: true, saved: saved?.length, engineCount: engineRows.length, aiCount: deduped.length }
    await cost.flush()
    return NextResponse.json({ success: true, tenders: saved, count: saved?.length || 0, steps })

  } catch (e: any) {
    console.error('[find-tenders] error:', e?.message)
    await cost.flush()
    return NextResponse.json({ error: e?.message, stack: e?.stack?.split('\n').slice(0, 4), steps }, { status: 500 })
  }
}
