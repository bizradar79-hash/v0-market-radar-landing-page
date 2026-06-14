// ─────────────────────────────────────────────────────────────────────────
// Shared Hebrew core-term matching — ONE implementation used by BOTH the
// tender engine (lib/tenders/from-engine.ts) and conference relevance gating
// (app/api/generate-conferences/route.ts).
//
// The job: given a client's keywords, decide whether a piece of text (a tender
// title, a conference name…) genuinely matches the client's DOMAIN — not just a
// generic side-word. Whole-word + root-aware, deterministic, no AI.
// ─────────────────────────────────────────────────────────────────────────

// Hebrew final-letter (sofit) → regular form, so a suffixed word lines up with
// its base: ריצוף (ends ף) vs ריצופים (regular פ) must share the root ריצופ.
export function deSofit(s: string): string {
  return s
    .replace(/ך/g, 'כ').replace(/ם/g, 'מ').replace(/ן/g, 'נ')
    .replace(/ף/g, 'פ').replace(/ץ/g, 'צ')
}

export function norm(s: string): string {
  return deSofit((s || '').toLowerCase())
    .replace(/[‏‎‪-‮]/g, '')
    .replace(/[^֐-׿A-zא-ת\d\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Hebrew stop-words too generic to be useful as match tokens.
export const STOP_TOKENS = new Set([
  'שירות', 'שירותי', 'מתן', 'אספקת', 'אספקה', 'עבור', 'בתחום', 'בתחומי',
  'ניהול', 'מערכת', 'מערכות', 'פיתוח', 'תחזוקה', 'רכישת', 'הספקת', 'כללי',
])

// Significant tokens (len ≥ 3, not stop-words) from a keyword phrase.
export function sigTokens(kw: string): string[] {
  return norm(kw).split(' ').filter(t => t.length >= 3 && !STOP_TOKENS.has(t))
}

// Hebrew GENERIC descriptors — room/location/surface words that qualify a
// product VARIANT but never DEFINE the client's domain. A match on one of these
// alone must NOT qualify a result. This is what killed the carpet client's
// false positives: "שטיח לחדר ילדים" → "חדר ניתוח", "שטיח סף לכניסה" → "בקרת כניסה".
// Stored already norm()'d (deSofit + lowercase) so they line up with sigTokens.
export const GENERIC_TOKENS = new Set([
  'חדר', 'חדרי', 'בית', 'כניסה', 'סף', 'פינה', 'פינת', 'קיר', 'רצפה', 'רצפת',
  'שינה', 'ילד', 'ילדים', 'ילדה', 'סלון', 'מבואה', 'מטבח', 'אמבטיה', 'גן',
  'משרד', 'מרפסת', 'מדרגות', 'עבודה', 'חוץ', 'פנים', 'קומה', 'דירה', 'מבנה',
  'אזור', 'שטח', 'מקום', 'אתר',
].map(norm))

// Hebrew one-letter prefix particles. "לסלון"/"לחדר"/"לכניסה" must be recognized
// as the generic words "סלון"/"חדר"/"כניסה", not treated as fresh defining tokens.
export const PARTICLES = new Set(['ב', 'ל', 'מ', 'ה', 'ו', 'ש', 'כ'])
export function deParticle(t: string): string {
  return t.length >= 4 && PARTICLES.has(t[0]) ? t.slice(1) : t
}
export function isGeneric(t: string): boolean {
  return GENERIC_TOKENS.has(t) || GENERIC_TOKENS.has(deParticle(t))
}

// Split text into whole WORDS (Hebrew word boundaries already handled by norm →
// whitespace). Word-to-word comparison is what kills substring false-positives
// like "טיח" ∈ "שטיח".
export function wordsOf(text: string): string[] {
  return norm(text).split(' ').filter(w => w.length >= 2)
}

// Root-aware WHOLE-WORD match between a keyword token and a text word (both
// already final-letter-normalized via norm). True when:
//   • exact, OR
//   • SUFFIX growth: root (≥3) sits at the START + a short ≤2 Hebrew suffix
//     (ים/ות/י/ה …) — e.g. שטיח↔שטיחים, ריצופ↔ריצופים.
//   • PREFIX particle: root (≥4) sits at the END + a short ≤2 leading particle
//     (ב/ל/מ/ש/ו/ה) — e.g. מערכת↔המערכת. Root must be ≥4 here BECAUSE a 1-char
//     particle on a 3-char root is ambiguous (ש+טיח vs the word שטיח): requiring
//     ≥4 kills the "טיח"↔"שטיח" false positive while keeping real prefixes.
export function rootMatch(kwTok: string, word: string): boolean {
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
export function wordHit(words: string[], tokens: string[]): boolean {
  if (tokens.length === 0 || words.length === 0) return false
  return tokens.some(tok => words.some(w => rootMatch(tok, w)))
}

export interface KwInfo {
  norm: string        // normalized full phrase (for multi-word phrase matching)
  tokens: string[]    // all significant tokens
  coreTokens: string[] // the DEFINING subset — the only tokens allowed to qualify
  multi: boolean      // is this a multi-word phrase?
}

export interface CoreModel {
  coreSet: Set<string>
  kwInfo: KwInfo[]
}

// Identify DEFINING (core) tokens vs GENERIC side-tokens for a client's keyword
// set. A multi-word keyword like "שטיח לחדר ילדים" carries ONE defining noun
// (שטיח) plus generic descriptors (חדר/ילדים). Only the defining token may
// qualify a result; a generic descriptor matching an unrelated domain
// ("חדר ניתוח") was the false-positive bug. A generic token is promoted to
// "core" only when it DOMINATES this client's keyword set (≥ half the keywords)
// — so a client whose domain genuinely is e.g. "ריהוט חדר ילדים" still works.
export function buildCoreModel(keywords: string[]): CoreModel {
  const freq = new Map<string, number>()
  for (const kw of keywords) {
    for (const t of new Set(sigTokens(kw))) freq.set(t, (freq.get(t) || 0) + 1)
  }
  const freqThreshold = Math.max(2, Math.ceil(keywords.length * 0.5))
  const coreSet = new Set<string>()
  for (const [t, f] of freq) {
    if (!isGeneric(t)) coreSet.add(t)           // non-generic = defining
    else if (f >= freqThreshold) coreSet.add(t)  // generic but dominant for THIS client
  }
  // Never over-filter into nothing: if every token read as generic, fall back to
  // the single most-frequent token(s) as the core domain term.
  if (coreSet.size === 0) {
    let maxF = 0
    for (const f of freq.values()) if (f > maxF) maxF = f
    for (const [t, f] of freq) if (f === maxF) coreSet.add(t)
  }

  const kwInfo = keywords.map(kw => {
    const tokens = sigTokens(kw)
    return {
      norm: norm(kw),
      tokens,
      coreTokens: tokens.filter(t => coreSet.has(t)),
      multi: norm(kw).includes(' '),
    }
  })

  return { coreSet, kwInfo }
}

// Does this text (title/body) match a DEFINING core token as a whole word, or a
// full multi-word keyword phrase? Generic side-tokens alone never qualify.
export function coreMatches(kwInfo: KwInfo[], text: string): boolean {
  const words = wordsOf(text)
  const textNorm = norm(text)
  return kwInfo.some(k =>
    (k.multi && textNorm.includes(k.norm)) ||
    wordHit(words, k.coreTokens)
  )
}
