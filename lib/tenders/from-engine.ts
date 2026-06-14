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

// Hebrew final-letter (sofit) → regular form, so a suffixed word lines up with
// its base: ריצוף (ends ף) vs ריצופים (regular פ) must share the root ריצופ.
function deSofit(s: string): string {
  return s
    .replace(/ך/g, 'כ').replace(/ם/g, 'מ').replace(/ן/g, 'נ')
    .replace(/ף/g, 'פ').replace(/ץ/g, 'צ')
}

function norm(s: string): string {
  return deSofit((s || '').toLowerCase())
    .replace(/[‏‎‪-‮]/g, '')
    .replace(/[^֐-׿A-zא-ת\d\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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

// Split text into a Set of whole WORDS (Hebrew word boundaries already handled
// by norm → whitespace). Word-to-word comparison is what kills substring
// false-positives like "טיח" ∈ "שטיח".
function wordsOf(text: string): string[] {
  return norm(text).split(' ').filter(w => w.length >= 2)
}

// Root-aware WHOLE-WORD match between a keyword token and a tender word (both
// already final-letter-normalized via norm). True when:
//   • exact, OR
//   • SUFFIX growth: root (≥3) sits at the START + a short ≤2 Hebrew suffix
//     (ים/ות/י/ה …) — e.g. שטיח↔שטיחים, ריצופ↔ריצופים.
//   • PREFIX particle: root (≥4) sits at the END + a short ≤2 leading particle
//     (ב/ל/מ/ש/ו/ה) — e.g. מערכת↔המערכת. Root must be ≥4 here BECAUSE a 1-char
//     particle on a 3-char root is ambiguous (ש+טיח vs the word שטיח): requiring
//     ≥4 kills the "טיח"↔"שטיח" false positive while keeping real prefixes.
function rootMatch(kwTok: string, word: string): boolean {
  if (!kwTok || !word) return false
  if (kwTok === word) return true
  const [short, long] = kwTok.length <= word.length ? [kwTok, word] : [word, kwTok]
  if (short.length < 3) return false
  const diff = long.length - short.length
  if (diff < 1 || diff > 2) return false
  if (long.startsWith(short)) return true            // suffix growth (root ≥3)
  if (short.length >= 4 && long.endsWith(short)) return true  // prefix particle (root ≥4)
  return false
}

// Any significant token of the keyword root-matches any whole word of the text.
function wordHit(words: string[], tokens: string[]): boolean {
  if (tokens.length === 0 || words.length === 0) return false
  return tokens.some(tok => words.some(w => rootMatch(tok, w)))
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

  // Precompute significant tokens per keyword once; flag multi-word phrases.
  const kwInfo = keywords.map(kw => ({
    norm: norm(kw),
    tokens: sigTokens(kw),
    multi: norm(kw).includes(' '),
  }))

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

    let raw = 0
    for (const k of kwInfo) {
      if (k.tokens.length === 0) continue
      // Title
      if (k.multi && titleNorm.includes(k.norm)) raw += 5
      else if (wordHit(titleWords, k.tokens)) raw += 3
      // Description
      if (k.multi && descNorm.includes(k.norm)) raw += 2
      else if (wordHit(descWords, k.tokens)) raw += 1
    }

    // Category — root-aware word match against the company's profile terms.
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
