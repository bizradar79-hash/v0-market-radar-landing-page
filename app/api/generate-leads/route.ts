export const dynamic = 'force-dynamic'

import { getFullContext } from '@/lib/context'
import { ScanCostCollector } from '@/lib/scan/cost-tracker'
import { validateUrl } from '@/lib/ai'
import { findRealUrl } from '@/lib/call-model'
import { NextResponse } from 'next/server'
import type { BusinessProfile } from '@/types/business-profile'

export const maxDuration = 60

const CACHE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
// Channel-driven caps (env-tunable). One web_search per channel; bounded total
// so URL verification (findRealUrl fallback) can't blow the time/cost budget.
const MAX_CHANNELS = Math.max(1, Number(process.env.LEADS_MAX_CHANNELS) || 8)
const LEADS_PER_CHANNEL = Math.max(1, Number(process.env.LEADS_PER_CHANNEL) || 4)
const LEADS_TOTAL_CAP = Math.max(1, Number(process.env.LEADS_TOTAL_CAP) || 12)

// One Grok web_search call → parsed JSON array. Shared by both paths.
async function grokSearch(prompt: string, cost: ScanCostCollector): Promise<any[]> {
  const t0 = Date.now()
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
  const data = await response.json().catch(() => ({}))
  cost.add({ provider: 'xai', model: 'grok-4-fast-non-reasoning', webSearch: true, data, ms: Date.now() - t0 })
  if (!response.ok || !data.output) return []
  const text = data.output
    .filter((item: any) => item.type === 'message')
    .flatMap((item: any) => item.content)
    .filter((c: any) => c.type === 'output_text')
    .map((c: any) => c.text)
    .join('')
  const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
  const start = clean.indexOf('[')
  const end = clean.lastIndexOf(']')
  if (start === -1 || end <= start) return []
  try { return JSON.parse(clean.slice(start, end + 1)) } catch { return [] }
}

export async function POST(request: Request) {
  const steps: Record<string, any> = {}
  let cost = new ScanCostCollector(null, 'leads')
  try {
    steps.context = 'starting'
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized', steps }, { status: 401 })
    steps.context = { ok: true, company: ctx.company?.name }

    cost = new ScanCostCollector(ctx.user.id, 'leads')

    const force = new URL(request.url).searchParams.get('force') === 'true'
    if (!force) {
      const { data: latest } = await ctx.supabase
        .from('leads').select('created_at').eq('company_id', ctx.user.id)
        .order('created_at', { ascending: false }).limit(1).single()
      if (latest?.created_at) {
        const age = Date.now() - new Date(latest.created_at).getTime()
        if (age < CACHE_MS) {
          console.log('[generate-leads] cache hit, age:', Math.round(age / 3600000), 'h')
          await cost.flush()
          return NextResponse.json({ success: true, cached: true })
        }
      }
    }

    const businessOverview = ctx.company?.business_overview || ctx.company?.description || ''
    const geoContext = ctx.geoContext || 'העסק פעיל בכל רחבי ישראל.'
    const isInternational = geoContext.includes('בינלאומי')

    const businessProfile = (ctx.company?.business_profile ?? null) as BusinessProfile | null

    // Explicit client area for geo-targeting (city → geographic_area → country).
    const city = (ctx.company?.city || '').trim()
    const area = (Array.isArray(ctx.company?.geographic_area) ? ctx.company.geographic_area : [])
      .filter(Boolean).join(', ')
    const areaLabel = city || area || 'ישראל'

    // ── PRIORITY: channel-driven partner search ───────────────────────────────
    // Manual/admin distribution channels are explicit intent — when present they
    // DRIVE the search: per channel (category), find REAL companies of that type
    // in the client's area. Each lead is tagged with its source channel.
    const channels: string[] = Array.isArray(businessProfile?.distributionChannels)
      ? businessProfile!.distributionChannels!
          .filter((c) => typeof c === 'string' && c.trim().length >= 2)
          .map((c) => c.trim())
          .slice(0, MAX_CHANNELS)
      : []

    let candidates: any[] = [] // each: { name, website, industry, reason, score, channel? }

    if (channels.length > 0) {
      steps.mode = 'channels'
      steps.channels = channels
      const perChannel = await Promise.all(
        channels.map(async (channel) => {
          const prompt = `מצא ${LEADS_PER_CHANNEL} חברות או עסקים אמיתיים מסוג "${channel}" באזור ${areaLabel}${isInternational ? '' : ' בישראל'}.
אלה ערוצי הפצה / שותפים פוטנציאליים עבור העסק: ${businessOverview.slice(0, 200)}.

דרישות:
- חברות אמיתיות וקיימות בלבד עם אתר אינטרנט אמיתי — לא להמציא.
- רלוונטיות גיאוגרפית לאזור ${areaLabel}.
- לכל חברה ציון 0-100 לפי כמה היא ערוץ/שותף חזק ורלוונטי לעסק.

חפש בעברית ובאנגלית. החזר את כל הטקסט בעברית.
החזר JSON בלבד:
[{"name": "", "website": "", "reason": "", "relevance_score": 0}]`
          const arr = await grokSearch(prompt, cost)
          return (Array.isArray(arr) ? arr : []).slice(0, LEADS_PER_CHANNEL).map((l: any) => ({
            name: l.name || '',
            website: l.website || '',
            industry: channel,            // show the category in the UI
            reason: l.reason || '',
            score: typeof l.relevance_score === 'number' ? l.relevance_score : 70,
            channel,                       // source tag
          }))
        })
      )
      candidates = perChannel.flat()
    } else {
      // ── FALLBACK: customer-finding search (unchanged behaviour) ─────────────
      steps.mode = 'customers'
      const audienceContext = businessProfile?.targetAudiences?.length
        ? `\nקהלי יעד מדויקים לחיפוש: ${businessProfile.targetAudiences.join(', ')}.`
        : ''
      const searchQueriesContext = businessProfile?.searchQueries?.length
        ? `\nשאילתות חיפוש לגילוי לידים: ${businessProfile.searchQueries.slice(0, 4).join(' | ')}.`
        : ''
      const prompt = `בהתבסס על תחום העסק: ${businessOverview}${audienceContext}${searchQueriesContext}
היקף גיאוגרפי: ${geoContext}
מצא 10 לידים פוטנציאליים ${isInternational ? 'בישראל ובעולם' : 'בישראל'} — חברות או ארגונים שסביר שיזדקקו לשירותי העסק הזה באופן קבוע.

תן עדיפות ל:
- עסקים בינוניים-קטנים (לא חברות ענק בינלאומיות)
- חברות שנמצאות בשלב צמיחה ויזדקקו לשירות באופן שוטף
- ארגונים עם צורך ברור בשירותי העסק

לכל ליד תן ציון 0-100 לפי:
- 40 נקודות: כמה הצורך בשירות ברור וישיר
- 30 נקודות: גודל מתאים (עדיף SMB על קורפורייט)
- 30 נקודות: סבירות שיש תקציב והם יגיבו

חפש בעברית ובאנגלית. החזר את כל הטקסט בעברית.
החזר JSON בלבד:
[{"name": "", "industry": "", "website": "", "reason": "", "contact_email": "", "relevance_score": 0}]`
      const arr = await grokSearch(prompt, cost)
      candidates = (Array.isArray(arr) ? arr : []).map((l: any) => ({
        name: l.name || '',
        website: l.website || '',
        industry: l.industry || '',
        reason: l.reason || '',
        score: typeof l.relevance_score === 'number' ? l.relevance_score : 70,
        channel: null,
      }))
    }

    steps.ai = { ok: true, count: candidates.length }

    // ── Filter + dedup + cap (before the expensive URL verification) ──────────
    const companyName = (ctx.company?.name || '').toLowerCase().slice(0, 6)
    const seenUrls = new Set<string>()
    candidates = candidates
      .filter((l) => (l.score ?? 0) >= 70 && l.name && !l.name.toLowerCase().includes(companyName))
      .filter((l) => {
        const u = (l.website || '').toLowerCase().trim()
        // allow empty website through to the verify step (findRealUrl may recover it)
        if (!u) return true
        if (seenUrls.has(u)) return false
        seenUrls.add(u)
        return true
      })
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, LEADS_TOTAL_CAP)

    // ── URL VERIFICATION (reuse validateUrl + findRealUrl — same as conferences/
    // tenders). NEVER store a verbatim unverified site: validate the model's URL;
    // if it fails, try findRealUrl + validate; if still unverified → DROP the lead.
    const verified = await Promise.all(
      candidates.map(async (l) => {
        const w = (l.website || '').trim()
        if (/^https?:\/\//i.test(w) && await validateUrl(w)) return { ...l, website: w }
        const candidate = await findRealUrl(
          l.name,
          `${l.channel ? l.channel + ' ' : ''}${areaLabel} ישראל`.trim(),
        )
        if (/^https?:\/\//i.test(candidate) && await validateUrl(candidate)) return { ...l, website: candidate }
        return null // unverified → drop (no fake links)
      })
    )
    const list = verified.filter((l): l is NonNullable<typeof l> => l !== null)
    steps.verified = { in: candidates.length, kept: list.length }

    steps.db = 'starting'
    await ctx.supabase.from('leads').delete().eq('company_id', ctx.user.id)

    if (list.length === 0) {
      await cost.flush()
      return NextResponse.json({ success: true, count: 0, mode: steps.mode, steps })
    }

    const { data: saved, error: insertError } = await ctx.supabase.from('leads').insert(
      list.map((l) => ({
        name: l.name || '',
        website: l.website || '',
        industry: l.industry || '',
        location: areaLabel,
        reason: l.reason || '',
        score: Math.min(100, l.score ?? 70),
        source: l.channel || '', // channel tag → group / prune by category
        company_id: ctx.user.id,
      }))
    ).select()

    if (insertError) {
      steps.db = { ok: false, error: insertError.message, code: insertError.code }
      await cost.flush()
      return NextResponse.json({ error: 'DB insert failed', steps }, { status: 500 })
    }
    steps.db = { ok: true, saved: saved?.length }

    await ctx.supabase.from('alerts').insert({
      company_id: ctx.user.id,
      title: 'לידים חדשים התגלו',
      message: `${saved?.length || 0} לידים פוטנציאליים`,
      type: 'success',
      link: '/app/leads',
      is_read: false,
    })

    await cost.flush()
    return NextResponse.json({ success: true, count: saved?.length || 0, mode: steps.mode, steps })
  } catch (e: any) {
    console.error('generate-leads error:', e?.message)
    await cost.flush()
    return NextResponse.json({ error: e?.message, stack: e?.stack?.split('\n').slice(0, 4), steps }, { status: 500 })
  }
}
