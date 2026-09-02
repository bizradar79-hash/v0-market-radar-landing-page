export const dynamic = 'force-dynamic'

import { getFullContext } from '@/lib/context'
import { ScanCostCollector } from '@/lib/scan/cost-tracker'
import { validateUrl } from '@/lib/ai'
import { findRealUrl } from '@/lib/call-model'
import { channelsSig } from '@/lib/leads/channels-sig'
import { deriveArea } from '@/lib/geo/area'
import { loadHiddenKeys, isHidden, filterHidden } from '@/lib/admin/hidden'
import { NextResponse } from 'next/server'
import type { BusinessProfile } from '@/types/business-profile'

export const maxDuration = 60

// Channel-driven caps (env-tunable), tightened for cost. Leads are ~88% of scan
// spend, so we process only the TOP-3 channels by the client's priority order
// (distributionChannels array order) and 3 companies each. One merged web_search
// per channel; URL verification runs only on the capped set. Remaining channels
// wait for a future run (channels change or admin force).
const MAX_CHANNELS = Math.max(1, Number(process.env.LEADS_MAX_CHANNELS) || 3)
const LEADS_PER_CHANNEL = Math.max(1, Number(process.env.LEADS_PER_CHANNEL) || 3)
// Total kept after cap ≈ channels × per-channel; verification never exceeds this.
const LEADS_TOTAL_CAP = Math.max(1, Number(process.env.LEADS_TOTAL_CAP) || 9)
/** Hard cap on PAID xAI web_search URL lookups per run (was: one per lead). */
const URL_LOOKUP_BUDGET = Math.max(0, Number(process.env.URL_LOOKUP_BUDGET) || 3)

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

    const businessOverview = ctx.company?.business_overview || ctx.company?.description || ''
    const geoContext = ctx.geoContext || 'העסק פעיל בכל רחבי ישראל.'
    const isInternational = geoContext.includes('בינלאומי')

    const businessProfile = (ctx.company?.business_profile ?? null) as BusinessProfile | null

    // ── CHANGE-GATE (enforced on ALL paths — no time-based refresh) ────────────
    // Run leads ONLY when: force=true (admin 🎯 button — the manual refresh),
    // channels CHANGED since the last run, or we've NEVER run for this client.
    // A returning client with unchanged channels SKIPS leads indefinitely (zero
    // leads cost) — the sig marks "already processed this exact channel set", so
    // even a 0-result run won't re-fire (fixes the old empty-leads re-run trap).
    const currentSig = channelsSig(businessProfile?.distributionChannels)
    const storedSig = typeof (businessProfile as any)?.leadsChannelsSig === 'string'
      ? (businessProfile as any).leadsChannelsSig : null
    const neverRan = storedSig === null
    const channelsChanged = storedSig !== currentSig
    if (!force && !neverRan && !channelsChanged) {
      console.log('[generate-leads] skipped — channels unchanged, no force')
      await cost.flush()
      return NextResponse.json({ success: true, skipped: 'channels_unchanged', sig: currentSig.slice(0, 24) })
    }

    // Persist the distribution-channels fingerprint so sync/run's change-gate
    // stays accurate. Computed from the RAW distributionChannels (same input the
    // gate hashes) → adds/removes/renames flip it, unchanged sets stay stable
    // ('empty' when none). Called on every SUCCESSFUL run (weekly/initial/admin).
    const persistChannelsSig = async () => {
      try {
        const merged = { ...(businessProfile ?? {}), leadsChannelsSig: channelsSig(businessProfile?.distributionChannels) }
        await ctx.supabase.from('companies').update({ business_profile: merged as any }).eq('id', ctx.user.id)
      } catch (e: any) {
        console.warn('[generate-leads] channels-sig persist failed:', e?.message)
      }
    }

    // Client area for geo-targeting — single source of truth (geographic_scope).
    const areaLabel = deriveArea(ctx.company, businessProfile).search

    // ── PRIORITY: channel-driven partner search ───────────────────────────────
    // Manual/admin distribution channels are explicit intent — when present they
    // DRIVE the search: per channel (category), find REAL companies of that type
    // in the client's area. Each lead is tagged with its source channel.
    // Respect admin-hidden channels + leads (never drive search on, or re-add, a hidden item).
    const hiddenChannelKeys = await loadHiddenKeys(ctx.user.id, 'channel')
    const hiddenLeadKeys = await loadHiddenKeys(ctx.user.id, 'lead')
    const channels: string[] = Array.isArray(businessProfile?.distributionChannels)
      ? businessProfile!.distributionChannels!
          .filter((c) => typeof c === 'string' && c.trim().length >= 2)
          .map((c) => c.trim())
          .filter((c) => !isHidden(hiddenChannelKeys, 'channel', c))
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
    // Cost-gated: the model's own URL is validated FREE (a HEAD request) and
    // only a missing/dead one falls through to a PAID xAI web_search — capped
    // at URL_LOOKUP_BUDGET per run. This loop previously fired one web_search
    // per lead (up to 9), which was the module's dominant cost.
    let urlLookups = 0
    const verified = await Promise.all(
      candidates.map(async (l) => {
        const w = (l.website || '').trim()
        if (/^https?:\/\//i.test(w) && await validateUrl(w)) return { ...l, website: w }
        if (urlLookups >= URL_LOOKUP_BUDGET) return null   // unverified → drop, no paid lookup
        urlLookups++
        const candidate = await findRealUrl(
          l.name,
          `${l.channel ? l.channel + ' ' : ''}${areaLabel} ישראל`.trim(),
          cost ?? undefined,
        )
        if (/^https?:\/\//i.test(candidate) && await validateUrl(candidate)) return { ...l, website: candidate }
        return null // unverified → drop (no fake links)
      })
    )
    console.log(`[leads] url lookups: ${urlLookups}/${URL_LOOKUP_BUDGET} paid web_search calls (of ${candidates.length} candidates)`)
    const verifiedList = verified.filter((l): l is NonNullable<typeof l> => l !== null)
    // Respect admin-hidden leads: a hidden lead must never be re-added.
    const list = filterHidden(verifiedList, 'lead', hiddenLeadKeys, (l: any) => l.name || '')
    steps.verified = { in: candidates.length, kept: list.length }

    steps.db = 'starting'
    await ctx.supabase.from('leads').delete().eq('company_id', ctx.user.id)

    if (list.length === 0) {
      await persistChannelsSig() // channels were processed — record sig so we don't re-run unchanged
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

    await persistChannelsSig() // successful run — update fingerprint (weekly/initial/admin)
    await cost.flush()
    return NextResponse.json({ success: true, count: saved?.length || 0, mode: steps.mode, steps })
  } catch (e: any) {
    console.error('generate-leads error:', e?.message)
    await cost.flush()
    return NextResponse.json({ error: e?.message, stack: e?.stack?.split('\n').slice(0, 4), steps }, { status: 500 })
  }
}
