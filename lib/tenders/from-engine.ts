import { createServerClient } from '@supabase/ssr'

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

function norm(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[‏‎‪-‮]/g, '')
    .replace(/[^֐-׿A-zא-ת\d\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasKeyword(text: string, kw: string): boolean {
  return norm(text).includes(norm(kw))
}

// Hebrew stop-words too generic to be useful as match tokens.
const STOP_TOKENS = new Set([
  'שירות', 'שירותי', 'מתן', 'אספקת', 'אספקה', 'עבור', 'בתחום', 'בתחומי',
  'ניהול', 'מערכת', 'מערכות', 'פיתוח', 'תחזוקה', 'רכישת', 'הספקת', 'כללי',
])

// Significant tokens (len ≥ 3, not stop-words) from a keyword phrase.
function sigTokens(kw: string): string[] {
  return norm(kw).split(' ').filter(t => t.length >= 3 && !STOP_TOKENS.has(t))
}

// A keyword "partially" hits text if any of its significant tokens appears.
function hasTokenMatch(text: string, tokens: string[]): boolean {
  if (tokens.length === 0) return false
  const t = norm(text)
  return tokens.some(tok => t.includes(tok))
}

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

  // Precompute significant tokens per keyword once.
  const kwTokens = keywords.map(kw => sigTokens(kw))

  const scored = withUrl.map((tender) => {
    const titleText = tender.title || ''
    const descText = tender.description || ''
    const catText = tender.category || ''

    let score = 0
    for (let i = 0; i < keywords.length; i++) {
      const kw = keywords[i]
      const tokens = kwTokens[i]
      // Title: full phrase (3) > partial token (2)
      if (hasKeyword(titleText, kw)) score += 3
      else if (hasTokenMatch(titleText, tokens)) score += 2
      // Description: full phrase (2) > partial token (1)
      if (hasKeyword(descText, kw)) score += 2
      else if (hasTokenMatch(descText, tokens)) score += 1
    }

    const normCat = norm(catText)
    if (profileTerms.some(t => t && normCat.includes(t))) score += 2

    return { tender, score: Math.min(score, 12) }
  })

  const filtered = scored
    .filter(({ score }) => score >= 2)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      if (!a.tender.deadline && !b.tender.deadline) return 0
      if (!a.tender.deadline) return 1
      if (!b.tender.deadline) return -1
      return a.tender.deadline.localeCompare(b.tender.deadline)
    })
    .slice(0, limit)

  const tenders = filtered.map(({ tender, score }) => ({
    ...tender,
    relevance_score: Math.min(100, 50 + score * 8),
    source: 'engine' as const,
    verified: true as const,
  }))

  return { tenders, poolTotal: poolTotal ?? 0, poolActive }
}
