export const dynamic = 'force-dynamic'

import { getFullContext } from '@/lib/context'
import { callModel, findRealUrl } from '@/lib/call-model'
import { validateUrl } from '@/lib/ai'
import { resolveDateVars } from '@/lib/resolve-prompt-vars'
import { NextResponse } from 'next/server'
import type { BusinessProfile } from '@/types/business-profile'
import { norm, wordsOf, wordHit, buildCoreModel, type KwInfo } from '@/lib/match/hebrew-core'
import { filterInsertRows } from '@/lib/admin/hidden'
import { isPastConference, parseConferenceDate, todayISO } from '@/lib/conferences/date'
import { ScanCostCollector } from '@/lib/scan/cost-tracker'
import { searchSubject } from '@/lib/keywords'

export const maxDuration = 60

const CACHE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
// Cap kept conferences. Ranked high-to-low by relevance, so this keeps the best
// matches rather than padding with loosely-related events. Env-tunable.
const CONFERENCES_MAX = Number(process.env.CONFERENCES_MAX) || 8
/** Hard cap on PAID xAI web_search URL lookups per run (was: one per item). */
const URL_LOOKUP_BUDGET = Math.max(0, Number(process.env.URL_LOOKUP_BUDGET) || 3)

// Conference relevance is encoded into the stored `description` (the conferences
// table has no relevance_score column) the same way tenders encode `[src:…]`:
//   description = `[rel:<score>]<reason>␟<real description>`
// The UI parses this prefix to show the % + band + reason and the clean text.
const FIELD_SEP = '␟'
function packDescription(score: number, reason: string, desc: string): string {
  const r = (reason || '').replace(/[\r\n]+/g, ' ').trim()
  return `[rel:${score}]${r}${FIELD_SEP}${desc || ''}`
}

// Broadly business-relevant terms (marketing / e-commerce / import / retail).
// A conference that doesn't hit the client's CORE domain but mentions one of
// these is kept at a low "general business" score rather than dropped.
const BROAD_TERMS = [
  'שיווק', 'מסחר', 'איקומרס', 'יבוא', 'יצוא', 'קמעונאות', 'עסקים', 'עסקי',
  'דיגיטל', 'מכירות', 'לוגיסטיקה', 'תערוכת', 'ecommerce', 'e-commerce',
  'marketing', 'retail', 'import', 'export', 'b2b', 'b2c', 'sme',
].map(s => s.toLowerCase())
function broadHit(text: string): boolean {
  const n = norm(text)
  return BROAD_TERMS.some(t => n.includes(t))
}

// Deterministic relevance score for one conference against the client's core
// terms (whole-word, root-aware — SAME logic as the tender engine). Don't trust
// the model's self-claim alone: a 'direct' claim with no verifiable core match
// is demoted to broad/drop.
function scoreConference(c: any, kwInfo: KwInfo[]): { score: number; tier: 'direct' | 'related' | 'broad' | 'drop' } {
  const name = String(c.name || c.title || '')
  const topics = Array.isArray(c.topics) ? c.topics.join(' ') : String(c.topics || '')
  const tags = Array.isArray(c.tags) ? c.tags.join(' ') : String(c.tags || '')
  const body = [String(c.description || ''), topics, tags].join(' ')
  const self = String(c.relevance || c.relevanceLevel || '').toLowerCase()

  const nameWords = wordsOf(name); const nameNorm = norm(name)
  const bodyWords = wordsOf(body); const bodyNorm = norm(body)

  // A MULTI-WORD keyword only qualifies via the PHRASE, never via one of its
  // words. "דיקור סיני" split into tokens let any text containing "סיני" pass —
  // which is how a conference about CHINA scored as a domain hit for a Chinese-
  // medicine clinic. Single-word keywords keep the token match (nothing to lose
  // there, and it preserves recall for every other client).
  const singleTokenHit = (words: string[]) =>
    kwInfo.some(k => !k.multi && wordHit(words, k.coreTokens))
  const phraseHit = (text: string) =>
    kwInfo.some(k => k.multi && text.includes(k.norm))

  const namePhrase = phraseHit(nameNorm)
  const nameCore = namePhrase || singleTokenHit(nameWords)
  const bodyCore = phraseHit(bodyNorm) || singleTokenHit(bodyWords)

  // Direct domain hit in the TITLE → high.
  if (nameCore) {
    let score = namePhrase ? 92 : 85
    if (bodyCore) score = Math.min(99, score + 4)
    return { score, tier: 'direct' }
  }
  // Domain hit only in the body/topics → medium.
  if (bodyCore) return { score: 58, tier: 'related' }
  // No domain hit, but a broad business event → low "general business" score.
  if (self.includes('broad') || broadHit(`${name} ${body}`)) return { score: 38, tier: 'broad' }
  // Unrelated → drop.
  return { score: 0, tier: 'drop' }
}

// Score → gate (drop unrelated) → sort desc → cap → store. Shared by BOTH the
// active-prompt AI path and the xAI fallback path so they gate identically.
async function finalizeConferences(rawItems: any[], kwInfo: KwInfo[], ctx: any, steps: Record<string, any>, cost?: ScanCostCollector) {
  const today = todayISO()

  // Future-dated only — via the SHARED comparable-date parser, so free-text dates
  // ("אמצע אוגוסט 2026", "סוף 2026") are decided the same way display decides them.
  // Unknown-precision dates ("יוכרז") are KEPT (can't disprove they're upcoming)
  // and get labeled at display time.
  let items = rawItems.filter((c: any) => !isPastConference(c?.date, today))

  // URL-dedup (only when a URL is present — conferences may legitimately lack one).
  const seen = new Set<string>()
  items = items.filter((c: any) => {
    const u = String(c.url || c.website || '').toLowerCase().replace(/\/$/, '').trim()
    if (!u) return true
    if (seen.has(u)) return false
    seen.add(u)
    return true
  })

  const scored = items
    .map((c: any) => ({ c, ...scoreConference(c, kwInfo) }))
    .filter((s) => s.tier !== 'drop')
    .sort((a, b) => b.score - a.score)
    .slice(0, CONFERENCES_MAX)

  steps.gate = {
    in: items.length,
    kept: scored.length,
    tiers: scored.reduce((m: any, s) => { m[s.tier] = (m[s.tier] || 0) + 1; return m }, {}),
  }

  // Nothing relevant survived → keep existing rather than wiping + padding.
  if (scored.length === 0) {
    return NextResponse.json({ success: true, conferences: [], count: 0, kept_existing: true, steps })
  }

  // URL RESOLUTION — same two-stage pattern as tenders: NEVER trust the model's
  // `website`/`url` field (it hallucinates events like hitech-hr.co.il). For each
  // kept conference (already capped at CONFERENCES_MAX), do a per-item xAI
  // web_search to find the real event page (findRealUrl), then validate it
  // resolves (validateUrl: HEAD→GET). Keep only a real, resolvable URL; otherwise
  // store '' (the UI falls back to a Google search by name).
  // URL RESOLUTION — cost-gated.
  // This used to fire a PAID xAI web_search for EVERY conference (up to 8 per
  // scan), even when the model had already returned a perfectly good URL. Now:
  //   1. trust + free-validate the model's own URL first (validateUrl = a HEAD)
  //   2. only fall back to web_search when that URL is missing or dead
  //   3. and never more than URL_LOOKUP_BUDGET times per run
  // Items still unresolved keep '' — the UI already falls back to a name search.
  let urlLookups = 0
  const resolved = await Promise.all(
    scored.map(async ({ c, score }) => {
      const name = String(c.name || c.title || '')
      const given = String(c.url || c.link || c.website || '').trim()
      // FREE path: the model's URL, validated with a plain HEAD request.
      if (/^https?:\/\//i.test(given) && await validateUrl(given)) {
        return { c, score, url: given }
      }
      if (urlLookups >= URL_LOOKUP_BUDGET) return { c, score, url: '' }
      urlLookups++
      const candidate = await findRealUrl(name, `כנס/אירוע ${String(c.location || '')}`.trim(), cost ?? undefined)
      const url = (/^https?:\/\//i.test(candidate) && await validateUrl(candidate)) ? candidate : ''
      return { c, score, url }
    })
  )
  console.log(`[conferences] url lookups: ${urlLookups}/${URL_LOOKUP_BUDGET} paid web_search calls (of ${scored.length} items)`)

  steps.urls = { resolved: resolved.filter(r => r.url).length, total: resolved.length }

  const rows = resolved.map(({ c, score, url }) => ({
    name: c.name || c.title || '',
    date: c.date || null,
    location: c.location || '',
    description: packDescription(score, c.relevanceReason || c.reason || '', c.description || ''),
    url, // validated Stage-2 URL or '' — never the model's hallucinated website
    category: c.category || '',
    company_id: ctx.user.id,
  }))

  // Respect admin-hidden items: a hidden conference must never be re-added.
  const rowsToSave = await filterInsertRows(ctx.user.id, 'conference', rows, (r: any) => r.name)
  // Delete ONLY once we have replacements. Deleting first meant an empty result
  // wiped the client's existing conferences — a refresh that found nothing left
  // them with nothing.
  if (rowsToSave.length === 0) {
    return NextResponse.json({ success: true, conferences: [], count: 0, kept_existing: true, steps })
  }
  await ctx.supabase.from('conferences').delete().eq('company_id', ctx.user.id)
  const { data: saved, error: insertError } = await ctx.supabase.from('conferences').insert(rowsToSave).select()
  if (insertError) {
    steps.db = { ok: false, error: insertError.message }
    return NextResponse.json({ error: 'DB insert failed', steps }, { status: 500 })
  }
  steps.db = { ok: true, saved: saved?.length }
  return NextResponse.json({ success: true, conferences: saved, count: saved?.length || 0, steps })
}


export async function POST(request: Request) {
  // This module fires xAI web_search (the module call + URL lookups) and was
  // entirely absent from cost_breakdown until now.
  let cost: ScanCostCollector | null = null
  const steps: Record<string, any> = {}
  try {
    steps.context = 'starting'
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized', steps }, { status: 401 })
    steps.context = { ok: true, company: ctx.company?.name }
    cost = new ScanCostCollector(ctx.user.id, 'conferences')

    const force = new URL(request.url).searchParams.get('force') === 'true'
    if (!force) {
      const { data: latest } = await ctx.supabase
        .from('conferences').select('created_at').eq('company_id', ctx.user.id)
        .order('created_at', { ascending: false }).limit(1).single()
      if (latest?.created_at) {
        const age = Date.now() - new Date(latest.created_at).getTime()
        if (age < CACHE_MS) {
          console.log('[generate-conferences] cache hit, age:', Math.round(age / 3600000), 'h')
          return NextResponse.json({ success: true, cached: true })
        }
      }
    }

    // ── Core-term model for relevance gating (shared with the tender engine) ─
    const bpTop = (ctx.company?.business_profile ?? null) as BusinessProfile | null
    const coreKeywords: string[] = (
      ctx.company?.keywords?.length ? ctx.company.keywords :
      bpTop?.primaryKeywords?.length ? bpTop.primaryKeywords :
      ctx.company?.industry ? [ctx.company.industry] : []
    ).slice(0, 12).filter(Boolean)
    const { coreSet, kwInfo } = buildCoreModel(coreKeywords)
    console.log('[conferences] core terms:', [...coreSet].join(', ') || '(none)')

    // Appended to whatever active/fallback prompt we use: fewer-but-relevant +
    // ask the model to self-assess so we can keep a few broad business events.
    const relevanceInstruction = `

חשוב מאוד (סינון רלוונטיות):
- החזר עד 10 כנסים רלוונטיים באמת. מעט ואיכותי עדיף על רשימה ארוכה ורופפת — אל תרפד באירועים רחוקים.
- התמקד ב-(א) התחום הישיר של החברה, ו-(ב) מעט אירועים עסקיים רחבים (שיווק, מסחר אלקטרוני, יבוא/קמעונאות) רק אם ברור שהם מועילים לעסק הזה.
- לכל כנס הוסף שני שדות: "relevanceReason" (משפט קצר אחד מדוע זה רלוונטי) ו-"relevance" באחת מהמילים: direct / broad / weak.`

    // ── AI path: use active prompt from prompt_versions if available ──────
    const { data: activePrompt } = await ctx.supabase
      .from('prompt_versions')
      .select('prompt, model_provider, model_name')
      .eq('module', 'conferences')
      .eq('is_active', true)
      .maybeSingle()

    if (activePrompt) {
      steps.aiPath = { provider: activePrompt.model_provider, model: activePrompt.model_name }
      const bp = (ctx.company?.business_profile ?? null) as BusinessProfile | null
      const keywords: string[] = ctx.company?.keywords || []
      const coreActivity = bp?.coreActivity || ctx.company?.description || ctx.company?.industry || ''
      const products = bp?.products?.map((p: any) => p.name).join(', ') || keywords.slice(0, 3).join(', ') || ''
      // The subject the model should search for: field phrases + industry
      // anchor, so an ambiguous word in the name/keywords can't redirect the
      // search to an unrelated topic.
      const subject = searchSubject(keywords, ctx.company, bp, 3)
      console.log('[conferences] search subject →', subject)
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
נושא החיפוש (בטא בדיוק זה — אל תרחיב למשמעות אחרת של מילה): ${subject}
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

      const finalPrompt = resolveDateVars(companyContext + resolvedPrompt) + relevanceInstruction

      try {
        const rawText = await callModel(activePrompt.model_provider, activePrompt.model_name, finalPrompt)
        steps.aiResult = { chars: rawText.length }

        let conferenceItems: any[] = []
        try {
          const clean = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
          const parsed = JSON.parse(clean)
          conferenceItems = Array.isArray(parsed) ? parsed : (parsed.conferences || [])
        } catch {
          try {
            const match = rawText.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
            if (match) {
              const parsed = JSON.parse(match[0])
              conferenceItems = Array.isArray(parsed) ? parsed : (parsed.conferences || [])
            }
          } catch {}
        }

        steps.aiParsed = { count: conferenceItems.length }

        if (conferenceItems.length > 0) {
          // Relevance-gate + cap + store (shared with the fallback path).
          {
            const out = await finalizeConferences(conferenceItems, kwInfo, ctx, steps, cost ?? undefined)
            await cost?.flush()
            return out
          }
        }
        steps.aiPath = { ...steps.aiPath, fallback: 'ai returned 0 items' }
      } catch (aiErr: any) {
        console.warn('[generate-conferences] AI path failed, falling back to xAI:', aiErr?.message)
        steps.aiPath = { ...steps.aiPath, fallback: aiErr?.message }
      }
    }

    // ── Fallback: hardcoded xAI call ──────────────────────────────────────
    const businessOverview = ctx.company?.business_overview || ctx.company?.description || ''
    const geoContext = ctx.geoContext || 'העסק פעיל בכל רחבי ישראל.'

    const businessProfile = (ctx.company?.business_profile ?? null) as BusinessProfile | null
    const industryTags = businessProfile?.industryTags?.length
      ? `תגיות תעשייה: ${businessProfile.industryTags.join(', ')}.`
      : ''
    const geoMarkets = businessProfile?.geographicMarkets?.length
      ? `שווקים גיאוגרפיים רלוונטיים: ${businessProfile.geographicMarkets.join(', ')}.`
      : ''

    const today = todayISO()
    const prompt = `בהתבסס על תחום העסק: ${businessOverview}
${industryTags}
${geoMarkets}
היקף גיאוגרפי: ${geoContext}
מצא עד 10 כנסים, תערוכות או אירועים מקצועיים רלוונטיים באמת ב-2026 — מעט ואיכותי עדיף על רשימה ארוכה ורופפת, אל תרפד באירועים רחוקים.
התמקד ב-(א) התחום הישיר של העסק, ו-(ב) מעט אירועים עסקיים רחבים (שיווק, מסחר אלקטרוני, יבוא/קמעונאות) רק אם ברור שהם מועילים לעסק.
${geoContext.includes('בינלאומי') ? 'כלול כנסים בינלאומיים גם מחוץ לישראל הרלוונטיים לתחום.' : 'כלול כנסים ואירועים בישראל בעיקר.'}
כלול אך ורק אירועים שמתקיימים מהתאריך ${today} והלאה. אסור בשום אופן להחזיר אירוע שכבר התקיים — עדיף להחזיר פחות אירועים מאשר אירוע שעבר.
בשדה "date" החזר תאריך ISO מדויק (YYYY-MM-DD) כשהוא ידוע.
אם התאריך המדויק אינו ידוע אך ידוע שהאירוע עתידי — החזר "date": "" והוסף "datePrecision": "unknown" (נציג "מועד יוכרז").
אם ידוע רק החודש — החזר "YYYY-MM" עם "datePrecision": "month".
לכל כנס הוסף "relevanceReason" (משפט קצר אחד מדוע זה רלוונטי) ו-"relevance" באחת מהמילים: direct / broad / weak.
חפש בעברית ובאנגלית. החזר את כל הטקסט בעברית.
החזר JSON בלבד:
[{"name": "", "date": "YYYY-MM-DD", "datePrecision": "day", "location": "", "website": "", "description": "", "category": "", "relevanceReason": "", "relevance": "direct"}]`

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
      steps.ai.error = data
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

    steps.ai = { ok: true, count: list.length }

    // Drop definitely-past events up front via the SHARED comparable-date parser
    // (the old isRecentYear check passed any string containing a 20xx year, so an
    // already-past "2026-01" survived). finalizeConferences re-checks too.
    list = list.filter((c: any) => !isPastConference(c?.date))

    steps.db = 'starting'
    // Relevance-gate + cap + store (shared with the active-prompt path).
    {
      const out = await finalizeConferences(list, kwInfo, ctx, steps, cost ?? undefined)
      await cost?.flush()
      return out
    }
  } catch (e: any) {
    console.error('generate-conferences error:', e?.message)
    return NextResponse.json({ error: e?.message, stack: e?.stack?.split('\n').slice(0, 4), steps }, { status: 500 })
  }
}
