export const dynamic = 'force-dynamic'

import { getFullContext } from '@/lib/context'
import { callModel } from '@/lib/call-model'
import { resolveDateVars } from '@/lib/resolve-prompt-vars'
import { NextResponse } from 'next/server'
import type { BusinessProfile } from '@/types/business-profile'
import { norm, wordsOf, wordHit, buildCoreModel, type KwInfo } from '@/lib/match/hebrew-core'

export const maxDuration = 60

const CACHE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
// Cap kept conferences. Ranked high-to-low by relevance, so this keeps the best
// matches rather than padding with loosely-related events. Env-tunable.
const CONFERENCES_MAX = Number(process.env.CONFERENCES_MAX) || 8

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

  const namePhrase = kwInfo.some(k => k.multi && nameNorm.includes(k.norm))
  const nameCore = namePhrase || kwInfo.some(k => wordHit(nameWords, k.coreTokens))
  const bodyCore = kwInfo.some(k => (k.multi && bodyNorm.includes(k.norm)) || wordHit(bodyWords, k.coreTokens))

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
async function finalizeConferences(rawItems: any[], kwInfo: KwInfo[], ctx: any, steps: Record<string, any>) {
  const today = new Date().toISOString().split('T')[0]

  // Future-dated only.
  let items = rawItems.filter((c: any) => !c.date || c.date >= today)

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

  const rows = scored.map(({ c, score }) => ({
    name: c.name || c.title || '',
    date: c.date || null,
    location: c.location || '',
    description: packDescription(score, c.relevanceReason || c.reason || '', c.description || ''),
    url: c.url || c.website || '',
    category: c.category || '',
    company_id: ctx.user.id,
  }))

  await ctx.supabase.from('conferences').delete().eq('company_id', ctx.user.id)
  const { data: saved, error: insertError } = await ctx.supabase.from('conferences').insert(rows).select()
  if (insertError) {
    steps.db = { ok: false, error: insertError.message }
    return NextResponse.json({ error: 'DB insert failed', steps }, { status: 500 })
  }
  steps.db = { ok: true, saved: saved?.length }
  return NextResponse.json({ success: true, conferences: saved, count: saved?.length || 0, steps })
}

function isRecentYear(dateStr: string): boolean {
  const match = dateStr?.match(/20(2[5-9]|[3-9]\d)/)
  return !!match
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
          return await finalizeConferences(conferenceItems, kwInfo, ctx, steps)
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

    const prompt = `בהתבסס על תחום העסק: ${businessOverview}
${industryTags}
${geoMarkets}
היקף גיאוגרפי: ${geoContext}
מצא עד 10 כנסים, תערוכות או אירועים מקצועיים רלוונטיים באמת ב-2026 — מעט ואיכותי עדיף על רשימה ארוכה ורופפת, אל תרפד באירועים רחוקים.
התמקד ב-(א) התחום הישיר של העסק, ו-(ב) מעט אירועים עסקיים רחבים (שיווק, מסחר אלקטרוני, יבוא/קמעונאות) רק אם ברור שהם מועילים לעסק.
${geoContext.includes('בינלאומי') ? 'כלול כנסים בינלאומיים גם מחוץ לישראל הרלוונטיים לתחום.' : 'כלול כנסים ואירועים בישראל בעיקר.'}
כלול רק אירועים אמיתיים עם תאריך עתידי.
כלול רק כנסים ואירועים עתידיים — תאריך 2026 בלבד שטרם עברו.
לכל כנס הוסף "relevanceReason" (משפט קצר אחד מדוע זה רלוונטי) ו-"relevance" באחת מהמילים: direct / broad / weak.
חפש בעברית ובאנגלית. החזר את כל הטקסט בעברית.
החזר JSON בלבד:
[{"name": "", "date": "YYYY-MM-DD", "location": "", "website": "", "description": "", "category": "", "relevanceReason": "", "relevance": "direct"}]`

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

    list = list.filter((c: any) => c.date === null || isRecentYear(c.date || ''))

    steps.db = 'starting'
    // Relevance-gate + cap + store (shared with the active-prompt path).
    return await finalizeConferences(list, kwInfo, ctx, steps)
  } catch (e: any) {
    console.error('generate-conferences error:', e?.message)
    return NextResponse.json({ error: e?.message, stack: e?.stack?.split('\n').slice(0, 4), steps }, { status: 500 })
  }
}
