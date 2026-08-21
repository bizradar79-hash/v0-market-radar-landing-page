/**
 * AI-powered competitor link discovery (replaces the search-scraping approach).
 *
 * WHY: parsing Google SERPs for `site:instagram.com "<name>"` returned garbage —
 * consent interstitials, `google.com/webhp`, and platform index pages instead of
 * the competitor's real profile. Grok with web_search does the disambiguation
 * far better ("which Instagram account belongs to THIS Israeli business?").
 *
 * THE CATCH: an LLM can fabricate a plausible-looking URL. So NOTHING the model
 * returns is trusted — every non-null URL goes through validateLink() and is
 * DROPPED unless we can positively confirm the page exists. Better to show an
 * empty field the admin can paste into than a confident wrong link.
 */
import { scrapeUrl, isBrightDataConfigured, RequestCounter } from '@/lib/brightdata/client'
import { resolveMapsId } from './maps-id'

// googleMaps is BEST-EFFORT and cheap (same single Grok call). Maps listing URLs
// are largely absent from the organic web index, so this often returns null —
// it is resolution PATH 1 of three, not the only one. DataForSEO's Maps search
// and a plain web search follow in lib/competitor-intel/engine.
export type LinkKey = 'website' | 'instagram' | 'facebook' | 'linkedin' | 'googleMaps'
export const LINK_KEYS: LinkKey[] = ['website', 'instagram', 'facebook', 'linkedin', 'googleMaps']

/**
 * found      = structurally valid AND positively confirmed to exist
 * unverified = structurally valid, but the platform blocked our check — KEPT,
 *              flagged for the admin. Never a rejection: an anti-bot response is
 *              not evidence the profile is fake.
 * dropped    = structurally wrong, or positively proven not to exist
 */
export type LinkOutcome = 'found' | 'unverified' | 'dropped' | 'not_found'
export interface LinkDiag {
  key: LinkKey
  outcome: LinkOutcome
  url: string          // the validated URL (outcome 'found') …
  candidate?: string   // … or what the AI suggested before we dropped it
  reason?: string      // why it was dropped / why nothing was returned
}
export interface AILinkResult {
  urls: Partial<Record<LinkKey, string>>
  /** Keys whose URL is populated but could not be confirmed (show "לא אומת"). */
  unverified?: LinkKey[]
  diagnostics: LinkDiag[]
  aiError?: string
}

const XAI_MODEL = 'grok-4-fast-non-reasoning'

function extractXAIText(output: any[]): string {
  return (output || [])
    .filter((i: any) => i?.type === 'message')
    .flatMap((i: any) => i.content || [])
    .filter((c: any) => c?.type === 'output_text')
    .map((c: any) => c.text)
    .join('')
}

// ── Shape checks — cheap rejection of obvious non-profiles ─────────────────
const HOST_RULES: Record<LinkKey, { host: RegExp; path?: RegExp }> = {
  website: { host: /.*/ },
  instagram: { host: /(^|\.)instagram\.com$/i, path: /^\/[A-Za-z0-9._]{2,40}\/?$/ },
  // /<page>, /pg/<page>, /people/<name>/<id>, or /profile.php?id=<numeric id>.
  facebook: { host: /(^|\.)facebook\.com$/i, path: /^\/(profile\.php$|(pg\/|people\/)?[A-Za-z0-9.\-_%]{2,80}\/?)/ },
  linkedin: { host: /(^|\.)linkedin\.com$/i, path: /^\/(company|school)\/[^/]{2,100}\/?/ },
  googleMaps: { host: /(^|\.)(google\.[a-z.]+|goo\.gl|maps\.app\.goo\.gl|g\.page)$/i },
}
const BAD_PATH = /^\/(login|signup|accounts|explore|help|policies|privacy|terms|about|home|pages|search|feed|directory|legal)(\/|$)/i
const BAD_SITE = /google\.|gstatic|instagram\.com|facebook\.com|linkedin\.com|tiktok\.com|youtube\.com|wikipedia\.org|yelp\.|zap\.co\.il|\.gov\./i

function shapeOk(key: LinkKey, url: string): string | null {
  let u: URL
  try { u = new URL(url) } catch { return 'not_a_url' }
  if (!/^https?:$/.test(u.protocol)) return 'bad_protocol'
  const rule = HOST_RULES[key]
  if (key === 'googleMaps') {
    if (!rule.host.test(u.hostname)) return 'not_a_google_maps_url'
    // A Google SEARCH url is not a listing — the id lives on a /maps link.
    if (/(^|\.)google\.[a-z.]+$/i.test(u.hostname) && !/^\/maps/.test(u.pathname)
        && !u.searchParams.get('cid') && !u.searchParams.get('ludocid')) return 'not_a_maps_listing'
    return null
  }
  if (key === 'website') {
    if (BAD_SITE.test(u.hostname)) return 'not_own_domain'
    return null
  }
  if (!rule.host.test(u.hostname)) return 'wrong_domain'
  if (BAD_PATH.test(u.pathname)) return 'platform_page_not_profile'
  if (u.pathname === '/' || u.pathname === '') return 'platform_root_not_profile'
  if (rule.path && !rule.path.test(u.pathname)) return 'not_a_profile_path'
  // facebook.com/profile.php is only a profile WITH its numeric id.
  if (key === 'facebook' && u.pathname === '/profile.php' && !/^\d{3,}$/.test(u.searchParams.get('id') || '')) {
    return 'profile_php_without_id'
  }
  return null
}

// ── Existence check ────────────────────────────────────────────────────────
// Same HEAD→GET pattern as lead-URL validation. Social platforms often block
// datacenter IPs (LinkedIn's 999, Instagram's login wall), so a block is NOT
// proof the page exists — we escalate to BrightData's unlocker for a real
// answer, and drop the URL when we still can't confirm it.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'

async function httpProbe(url: string): Promise<{ status: number; body?: string }> {
  try {
    const head = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(6000), headers: { 'User-Agent': UA } })
    if (head.status === 405 || head.status === 403 || head.status === 999) {
      const get = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(8000), headers: { 'User-Agent': UA } })
      return { status: get.status, body: (await get.text().catch(() => '')).slice(0, 4000) }
    }
    return { status: head.status }
  } catch {
    return { status: 0 }
  }
}

/**
 * Three verdicts, not two. The old boolean conflated "proven fake" with "we
 * couldn't tell", so a Facebook page that happened to serve an anti-bot blank
 * was reported as נפסל — and the SAME url validated fine on the next run. A
 * blocked response is absence of evidence, never evidence of absence.
 */
export type Verdict = 'valid' | 'unverified' | 'invalid'
interface Check { verdict: Verdict; reason?: string }

// A profile page that really rendered shows the handle plus profile furniture.
const PROFILE_SIGNAL = /followers|following|posts|likes|employees|עוקבים|עוקב|פוסטים|לייקים|עובדים/i
// Positive proof of NON-existence — the only text that may reject a URL.
const NOT_AVAILABLE = /Sorry, this page isn'?t available|Page Not Found|content isn'?t available|This page isn'?t available|page you requested was not found|הדף אינו זמין|העמוד לא נמצא/i
/** A rendered page this short is an anti-bot stub, not a verdict. */
const RENDERED_MIN = 1500

/**
 * Platforms that routinely serve blocked/blank pages to automated checks. For
 * these, STRUCTURE is the primary signal and the fetch is a bonus: it can only
 * upgrade to 'valid' or reject on an explicit not-found marker — never on noise.
 * (Instagram renders reliably through the unlocker, so it stays strict.)
 */
const ANTI_BOT: Record<LinkKey, boolean> = {
  website: false, instagram: false, facebook: true, linkedin: true,
  // Google blocks automated checks; a Maps link is validated by whether an id
  // can be extracted from it, not by fetching the page.
  googleMaps: true,
}

async function checkSocial(key: LinkKey, url: string, counter?: RequestCounter): Promise<Check> {
  // Structure already passed at this point. Decide what a failed fetch means.
  const inconclusive: Check = ANTI_BOT[key]
    ? { verdict: 'unverified', reason: 'platform_blocked_check' }
    : { verdict: 'unverified', reason: 'check_inconclusive' }

  if (!isBrightDataConfigured()) return { verdict: 'unverified', reason: 'no_validator' }
  const r = await scrapeUrl(url, counter)
  const text = r.text || ''
  // Empty / errored fetch → we learned nothing. Keep the URL, flag it.
  if (!r.ok || text.trim().length < 200) return inconclusive

  // Explicit "this page does not exist" is the ONLY basis for rejection.
  if (NOT_AVAILABLE.test(text)) return { verdict: 'invalid', reason: 'profile_not_found' }

  const rendered = text.trim().length >= RENDERED_MIN && PROFILE_SIGNAL.test(text)
  const slug = decodeURIComponent(new URL(url).pathname.replace(/\/+$/, '').split('/').pop() || '')
  const handleOnPage = !slug || slug.length <= 2 || text.toLowerCase().includes(slug.toLowerCase())

  if (rendered && handleOnPage) return { verdict: 'valid' }
  // A fully-rendered profile page that never mentions its own handle is a real
  // mismatch — but only trust that when the page actually rendered.
  if (rendered && !handleOnPage) {
    return ANTI_BOT[key] ? { verdict: 'unverified', reason: 'handle_not_on_page' } : { verdict: 'invalid', reason: 'handle_not_on_page' }
  }
  return inconclusive
}

/**
 * Deterministic given the same candidate: the structural gate runs first and
 * always produces the same answer, and no network outcome can turn a
 * well-formed URL into a rejection — only an explicit not-found marker can.
 */
export async function validateLink(key: LinkKey, url: string, counter?: RequestCounter): Promise<Check> {
  // 1. STRUCTURE — the primary, fully deterministic signal.
  const shape = shapeOk(key, url)
  if (shape) return { verdict: 'invalid', reason: shape }

  // GOOGLE MAPS — the useful proof is "does an id come out of it", not "does
  // the page load" (Google blocks the fetch anyway).
  if (key === 'googleMaps') {
    const id = await resolveMapsId(url)
    if (id.cid || id.placeId) return { verdict: 'valid' }
    return { verdict: 'unverified', reason: id.error || 'no_business_id' }
  }

  if (key !== 'website') return checkSocial(key, url, counter)

  // 2. A plain website is honest over HTTP — a 404 there is a real 404.
  const probe = await httpProbe(url)
  if (probe.status >= 200 && probe.status < 400) {
    if (probe.body && NOT_AVAILABLE.test(probe.body)) return { verdict: 'invalid', reason: 'page_not_available' }
    return { verdict: 'valid' }
  }
  if (probe.status === 404 || probe.status === 410) return { verdict: 'invalid', reason: `http_${probe.status}` }
  // Blocked or network error → ask the unlocker; still inconclusive → keep+flag.
  if (isBrightDataConfigured()) {
    const r = await scrapeUrl(url, counter)
    if (r.ok && (r.text || '').trim().length > 200) return { verdict: 'valid' }
  }
  return { verdict: 'unverified', reason: `unreachable_http_${probe.status}` }
}

// ── The Grok call ──────────────────────────────────────────────────────────
function buildPrompt(name: string, knownWebsite?: string, city?: string): string {
  const hint = knownWebsite?.trim()
    ? `\nהאתר של העסק (רמז חזק לזיהוי — השתמש בו כדי לוודא שמדובר באותו עסק בדיוק): ${knownWebsite.trim()}`
    : ''
  const where = city?.trim() ? `\nאזור הפעילות (לצמצום בלבד — ייתכן שהעסק פועל גם מחוץ לאזור): ${city.trim()}` : ''
  return `מצא את הקישורים הרשמיים של העסק הישראלי הבא.

שם העסק: ${name}${hint}${where}

חפש באינטרנט ומצא את הפרופילים הרשמיים של העסק הזה בדיוק (לא של עסק אחר עם שם דומה, לא של עמוד אוהדים, לא של עמוד קבוצה/קהילה, לא של עובד פרטי).

כללים מחייבים:
- החזר null לכל שדה שלא מצאת בוודאות. עדיף null מאשר ניחוש.
- אסור להמציא או "לנחש" כתובת URL. רק כתובת שראית בפועל בתוצאות החיפוש.
- לינקדאין: עמוד החברה (/company/...), לא פרופיל אישי.
- אינסטגרם/פייסבוק: עמוד העסק עצמו.
- אתר: הדומיין של העסק עצמו, לא רשת חברתית ולא אינדקס עסקים.
- גוגל מפות (googleMaps): הקישור לכרטיס העסק ב-Google Maps / Google Business
  (כתובת מסוג /maps/place/... או קישור עם cid, או קישור מקוצר maps.app.goo.gl).
  אל תחזיר קישור לחיפוש (/maps/search/...). אם לא מצאת — null.

החזר JSON בלבד, ללא טקסט נוסף, בפורמט:
{"website": "https://..." או null, "instagram": "https://..." או null, "facebook": "https://..." או null, "linkedin": "https://..." או null, "googleMaps": "https://..." או null}`
}

async function askGrok(name: string, knownWebsite?: string, city?: string): Promise<{ raw: Partial<Record<LinkKey, string>>; error?: string }> {
  if (!process.env.XAI_API_KEY) return { raw: {}, error: 'missing_xai_key' }
  try {
    const res = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.XAI_API_KEY}` },
      body: JSON.stringify({
        model: XAI_MODEL,
        input: [{ role: 'user', content: buildPrompt(name, knownWebsite, city) }],
        tools: [{ type: 'web_search' }],
      }),
      signal: AbortSignal.timeout(60000),
    })
    if (!res.ok) return { raw: {}, error: `xai_http_${res.status}` }
    const data = await res.json().catch(() => null)
    const text = extractXAIText(data?.output || [])
    if (!text.trim()) return { raw: {}, error: 'xai_empty_response' }

    // Strict parse — any failure yields all-null rather than throwing.
    const clean = text.replace(/```json/gi, '').replace(/```/g, '').trim()
    const start = clean.indexOf('{')
    const end = clean.lastIndexOf('}')
    if (start === -1 || end <= start) return { raw: {}, error: 'xai_no_json' }
    const parsed = JSON.parse(clean.slice(start, end + 1))
    const raw: Partial<Record<LinkKey, string>> = {}
    for (const k of LINK_KEYS) {
      const v = parsed?.[k]
      if (typeof v === 'string' && /^https?:\/\//i.test(v.trim())) raw[k] = v.trim()
    }
    return { raw }
  } catch (e: any) {
    return { raw: {}, error: e?.name === 'TimeoutError' ? 'xai_timeout' : (e?.message || 'xai_failed').slice(0, 60) }
  }
}

/**
 * Find + VALIDATE a competitor's official links.
 * One Grok web-search call, then one lightweight existence check per candidate.
 * Never throws: on any failure it returns empty urls plus a diagnostic reason.
 */
export async function findCompetitorLinksAI(
  name: string, knownWebsite?: string, counter?: RequestCounter, city?: string,
): Promise<AILinkResult> {
  const clean = (name || '').trim()
  if (!clean) return { urls: {}, diagnostics: [], aiError: 'missing_name' }

  const { raw, error } = await askGrok(clean, knownWebsite, city)
  const urls: Partial<Record<LinkKey, string>> = {}
  const diagnostics: LinkDiag[] = []

  const unverified: LinkKey[] = []
  await Promise.all(LINK_KEYS.map(async (key) => {
    const candidate = raw[key]
    if (!candidate) {
      diagnostics.push({ key, outcome: 'not_found', url: '', reason: error || 'ai_returned_null' })
      return
    }
    const { verdict, reason } = await validateLink(key, candidate, counter)
    if (verdict === 'invalid') {
      // Structurally wrong, or proven not to exist — never surfaced.
      diagnostics.push({ key, outcome: 'dropped', url: '', candidate, reason })
      return
    }
    // 'valid' and 'unverified' both populate the field; only the label differs,
    // so a bot-blocked platform never costs the admin a real link.
    urls[key] = candidate
    if (verdict === 'unverified') unverified.push(key)
    diagnostics.push({ key, outcome: verdict === 'valid' ? 'found' : 'unverified', url: candidate, reason })
  }))

  diagnostics.sort((a, b) => LINK_KEYS.indexOf(a.key) - LINK_KEYS.indexOf(b.key))
  console.log('[find-links-ai]', clean, JSON.stringify({ raw, diagnostics, aiError: error }))
  return { urls, unverified, diagnostics, aiError: error }
}
