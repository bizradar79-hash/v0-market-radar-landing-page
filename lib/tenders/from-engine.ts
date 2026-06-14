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

// Hebrew GENERIC descriptors — room/location/surface words that qualify a
// product VARIANT but never DEFINE the client's domain. A match on one of these
// alone must NOT qualify a tender. This is what killed the carpet client's
// false positives: "שטיח לחדר ילדים" → "חדר ניתוח", "שטיח סף לכניסה" → "בקרת כניסה".
// Stored already norm()'d (deSofit + lowercase) so they line up with sigTokens.
const GENERIC_TOKENS = new Set([
  'חדר', 'חדרי', 'בית', 'כניסה', 'סף', 'פינה', 'פינת', 'קיר', 'רצפה', 'רצפת',
  'שינה', 'ילד', 'ילדים', 'ילדה', 'סלון', 'מבואה', 'מטבח', 'אמבטיה', 'גן',
  'משרד', 'מרפסת', 'מדרגות', 'עבודה', 'חוץ', 'פנים', 'קומה', 'דירה', 'מבנה',
  'אזור', 'שטח', 'מקום', 'אתר',
].map(norm))

// Hebrew one-letter prefix particles. "לסלון"/"לחדר"/"לכניסה" must be recognized
// as the generic words "סלון"/"חדר"/"כניסה", not treated as fresh defining tokens.
const PARTICLES = new Set(['ב', 'ל', 'מ', 'ה', 'ו', 'ש', 'כ'])
function deParticle(t: string): string {
  return t.length >= 4 && PARTICLES.has(t[0]) ? t.slice(1) : t
}
function isGeneric(t: string): boolean {
  return GENERIC_TOKENS.has(t) || GENERIC_TOKENS.has(deParticle(t))
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

  // ── Identify DEFINING (core) tokens vs GENERIC side-tokens ───────────────
  // A multi-word keyword like "שטיח לחדר ילדים" carries ONE defining noun (שטיח)
  // plus generic descriptors (חדר/ילדים). Only the defining token may qualify a
  // tender; a generic descriptor matching an unrelated domain ("חדר ניתוח") was
  // the false-positive bug. A generic token is promoted to "core" only when it
  // DOMINATES this client's keyword set (≥ half the keywords) — so a client whose
  // domain genuinely is e.g. "ריהוט חדר ילדים" still works.
  const freq = new Map<string, number>()
  for (const kw of keywords) {
    for (const t of new Set(sigTokens(kw))) freq.set(t, (freq.get(t) || 0) + 1)
  }
  const freqThreshold = Math.max(2, Math.ceil(keywords.length * 0.5))
  const coreSet = new Set<string>()
  for (const [t, f] of freq) {
    if (!isGeneric(t)) coreSet.add(t)          // non-generic = defining
    else if (f >= freqThreshold) coreSet.add(t) // generic but dominant for THIS client
  }
  // Never over-filter into nothing: if every token read as generic, fall back to
  // the single most-frequent token(s) as the core domain term.
  if (coreSet.size === 0) {
    let maxF = 0
    for (const f of freq.values()) if (f > maxF) maxF = f
    for (const [t, f] of freq) if (f === maxF) coreSet.add(t)
  }

  // Precompute per keyword: normalized phrase, all tokens, the CORE subset, and
  // a multi-word flag. coreTokens is the ONLY set allowed to qualify a tender.
  const kwInfo = keywords.map(kw => {
    const tokens = sigTokens(kw)
    return {
      norm: norm(kw),
      tokens,
      coreTokens: tokens.filter(t => coreSet.has(t)),
      multi: norm(kw).includes(' '),
    }
  })

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
