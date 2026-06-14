import { createServerClient } from '@supabase/ssr'
import { norm, sigTokens, wordsOf, wordHit, buildCoreModel } from '@/lib/match/hebrew-core'

interface CompanyForTenders {
  keywords?: string[]
  industry?: string
  business_profile?: any
}

export interface EngineTender {
  id: string
  title: string
  publisher: string | null
  deadline: string | null
  publish_date: string | null
  url: string | null
  description: string | null
  category: string | null
  budget: string | null
  source: 'engine'
  verified: true
  relevance_score: number
}

// Hebrew normalization + whole-word root-aware matching live in the shared
// module @/lib/match/hebrew-core (imported above) so tenders + conferences use
// ONE implementation of the core-term logic.

function todayIsrael(): string {
  return new Date().toLocaleString('en-CA', { timeZone: 'Asia/Jerusalem' }).split(',')[0]
}

function makeServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return [] },
        setAll() {},
      },
    }
  )
}

export interface EngineResult {
  tenders: EngineTender[]
  poolTotal: number
  poolActive: number
}

export async function getEngineTendersForCompany(
  company: CompanyForTenders,
  limit: number
): Promise<EngineResult> {
  const sc = makeServiceClient()
  const today = todayIsrael()

  const { count: poolTotal } = await sc
    .from('tender_pool')
    .select('id', { count: 'exact', head: true })

  const { data, error } = await sc
    .from('tender_pool')
    .select('id, title, publisher, deadline, publish_date, url, description, category, budget')
    .eq('status', 'open')
    .or(`deadline.gte.${today},deadline.is.null`)

  const poolActive = data?.length ?? 0

  if (error || !data || data.length === 0) {
    return { tenders: [], poolTotal: poolTotal ?? 0, poolActive }
  }

  const bp = company.business_profile
  const keywords: string[] = (
    company.keywords?.length ? company.keywords :
    bp?.primaryKeywords?.length ? bp.primaryKeywords :
    company.industry ? [company.industry] : []
  ).slice(0, 12).filter(Boolean)

  if (keywords.length === 0) return { tenders: [], poolTotal: poolTotal ?? 0, poolActive }

  // Engine tenders MUST carry a real scraped URL — drop any without one
  const withUrl = data.filter(t => !!t.url && /^https?:\/\//i.test(t.url))

  // Terms used for category matching
  const profileTerms: string[] = [
    company.industry,
    ...(bp?.industryTags || []),
    ...(bp?.primaryKeywords?.slice(0, 3) || []),
  ].filter(Boolean).map(norm)

  // DEFINING (core) tokens vs GENERIC side-tokens — shared core-term model. Only
  // a core token (or a full multi-word phrase) may qualify a tender; generic
  // side-tokens (חדר/כניסה/ילדים…) never do. See lib/match/hebrew-core.ts.
  const { coreSet, kwInfo } = buildCoreModel(keywords)

  console.log('[tenders] core terms:', [...coreSet].join(', ') || '(none)')

  // Honest scoring (deterministic, no AI):
  //   title phrase +5 · title word(root) +3 · desc phrase +2 · desc word +1 · category +3
  // relevance% = clamp(round(raw / MAX_REASONABLE * 100), 10, 99), MAX_REASONABLE = 10.
  // So one token-in-title (+3) ≈ 30%, a phrase+category (8) ≈ 80% — no inflation.
  const MAX_REASONABLE = 10
  const MIN_RAW = 3 // at least one real word/phrase/category hit (not just a desc token)

  const scored = withUrl.map((tender) => {
    const titleWords = wordsOf(tender.title || '')
    const descWords = wordsOf(tender.description || '')
    const titleNorm = norm(tender.title || '')
    const descNorm = norm(tender.description || '')
    const catWords = wordsOf(tender.category || '')

    // QUALIFY (hard gate): a tender counts ONLY if it matches a DEFINING (core)
    // token as a whole word, or a full multi-word keyword phrase. Generic
    // side-tokens (חדר/כניסה/ילדים…) can never qualify a tender on their own, and
    // a category/publisher match alone can't either — that was the source of the
    // "חדר ניתוח" (60%) and "בקרת כניסה" (30%) false matches for the carpet client.
    const coreMatched = kwInfo.some(k =>
      (k.multi && (titleNorm.includes(k.norm) || descNorm.includes(k.norm))) ||
      wordHit(titleWords, k.coreTokens) ||
      wordHit(descWords, k.coreTokens)
    )
    if (!coreMatched) return { tender, raw: 0, relevance: 10 }

    let raw = 0
    for (const k of kwInfo) {
      if (k.coreTokens.length === 0 && !k.multi) continue
      // Title — full phrase is strongest; else a CORE whole-word hit.
      if (k.multi && titleNorm.includes(k.norm)) raw += 5
      else if (wordHit(titleWords, k.coreTokens)) raw += 3
      // Description
      if (k.multi && descNorm.includes(k.norm)) raw += 2
      else if (wordHit(descWords, k.coreTokens)) raw += 1
    }

    // Category — additive only (the tender already core-matched above).
    if (profileTerms.some(t => t && wordHit(catWords, sigTokens(t)))) raw += 3

    const relevance = Math.max(10, Math.min(99, Math.round((raw / MAX_REASONABLE) * 100)))
    return { tender, raw, relevance }
  })

  const filtered = scored
    .filter(({ raw }) => raw >= MIN_RAW)
    .sort((a, b) => {
      if (b.relevance !== a.relevance) return b.relevance - a.relevance
      if (!a.tender.deadline && !b.tender.deadline) return 0
      if (!a.tender.deadline) return 1
      if (!b.tender.deadline) return -1
      return a.tender.deadline.localeCompare(b.tender.deadline)
    })
    .slice(0, limit)

  const tenders = filtered.map(({ tender, relevance }) => ({
    ...tender,
    relevance_score: relevance,
    source: 'engine' as const,
    verified: true as const,
  }))

  return { tenders, poolTotal: poolTotal ?? 0, poolActive }
}
