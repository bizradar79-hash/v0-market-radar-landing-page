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

export type LinkKey = 'website' | 'instagram' | 'facebook' | 'linkedin'
export const LINK_KEYS: LinkKey[] = ['website', 'instagram', 'facebook', 'linkedin']

/** found = AI returned + validated · dropped = AI returned but failed validation. */
export type LinkOutcome = 'found' | 'dropped' | 'not_found'
export interface LinkDiag {
  key: LinkKey
  outcome: LinkOutcome
  url: string          // the validated URL (outcome 'found') …
  candidate?: string   // … or what the AI suggested before we dropped it
  reason?: string      // why it was dropped / why nothing was returned
}
export interface AILinkResult {
  urls: Partial<Record<LinkKey, string>>
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
  facebook: { host: /(^|\.)facebook\.com$/i, path: /^\/(pg\/|profile\.php|people\/)?[A-Za-z0-9.\-_%]{2,80}\/?/ },
  linkedin: { host: /(^|\.)linkedin\.com$/i, path: /^\/(company|school)\/[^/]{2,100}\/?/ },
}
const BAD_PATH = /^\/(login|signup|accounts|explore|help|policies|privacy|terms|about|home|pages|search|feed|directory|legal)(\/|$)/i
const BAD_SITE = /google\.|gstatic|instagram\.com|facebook\.com|linkedin\.com|tiktok\.com|youtube\.com|wikipedia\.org|yelp\.|zap\.co\.il|\.gov\./i

function shapeOk(key: LinkKey, url: string): string | null {
  let u: URL
  try { u = new URL(url) } catch { return 'not_a_url' }
  if (!/^https?:$/.test(u.protocol)) return 'bad_protocol'
  const rule = HOST_RULES[key]
  if (key === 'website') {
    if (BAD_SITE.test(u.hostname)) return 'not_own_domain'
    return null
  }
  if (!rule.host.test(u.hostname)) return 'wrong_domain'
  if (BAD_PATH.test(u.pathname)) return 'platform_page_not_profile'
  if (u.pathname === '/' || u.pathname === '') return 'platform_root_not_profile'
  if (rule.path && !rule.path.test(u.pathname)) return 'not_a_profile_path'
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

/** Blocked/anti-bot responses — inconclusive, not a verdict. */
const BLOCKED = new Set([401, 403, 429, 999, 0, 400])

// A profile page that really exists renders the handle plus profile furniture.
const PROFILE_SIGNAL = /followers|following|posts|likes|employees|עוקבים|עוקב|פוסטים|לייקים|עובדים/i
const NOT_AVAILABLE = /Sorry, this page isn'?t available|Page Not Found|content isn'?t available|This page isn'?t available|page you requested was not found|הדף אינו זמין|העמוד לא נמצא/i

/**
 * MEASURED, not assumed: a plain HTTP GET cannot validate a social profile.
 * instagram.com/<real> and instagram.com/<nonexistent> BOTH return HTTP 200 with
 * the same JS shell, and facebook.com returns 400 for real and fake pages alike.
 * So social URLs are validated through BrightData's unlocker, which renders the
 * real page — and we require positive proof (the handle + profile furniture)
 * rather than merely "the request didn't fail".
 */
async function validateSocial(url: string, counter?: RequestCounter): Promise<{ ok: boolean; reason?: string }> {
  if (!isBrightDataConfigured()) return { ok: false, reason: 'no_validator' }
  const r = await scrapeUrl(url, counter)
  const text = (r.text || '')
  if (!r.ok || text.trim().length < 200) return { ok: false, reason: `unverified_${r.error || 'empty'}`.slice(0, 40) }
  if (NOT_AVAILABLE.test(text)) return { ok: false, reason: 'profile_not_found' }

  // The handle/slug the URL claims must actually appear on the rendered page.
  const slug = decodeURIComponent(new URL(url).pathname.replace(/\/+$/, '').split('/').pop() || '')
  if (slug && slug.length > 2 && !text.toLowerCase().includes(slug.toLowerCase())) {
    return { ok: false, reason: 'handle_not_on_page' }
  }
  if (!PROFILE_SIGNAL.test(text)) return { ok: false, reason: 'no_profile_signal' }
  return { ok: true }
}

export async function validateLink(key: LinkKey, url: string, counter?: RequestCounter): Promise<{ ok: boolean; reason?: string }> {
  const shape = shapeOk(key, url)
  if (shape) return { ok: false, reason: shape }
  if (key !== 'website') return validateSocial(url, counter)

  // A plain website is honest over HTTP — a 404 is a real 404.
  const probe = await httpProbe(url)
  if (probe.status >= 200 && probe.status < 400) {
    if (probe.body && NOT_AVAILABLE.test(probe.body)) return { ok: false, reason: 'page_not_available' }
    return { ok: true }
  }
  if (probe.status === 404 || probe.status === 410) return { ok: false, reason: `http_${probe.status}` }
  // Blocked or network error → let the unlocker settle it.
  if (BLOCKED.has(probe.status) && isBrightDataConfigured()) {
    const r = await scrapeUrl(url, counter)
    if (r.ok && (r.text || '').trim().length > 200) return { ok: true }
    return { ok: false, reason: `unverified_${r.error || 'empty'}`.slice(0, 40) }
  }
  return { ok: false, reason: `unverified_http_${probe.status}` }
}

// ── The Grok call ──────────────────────────────────────────────────────────
function buildPrompt(name: string, knownWebsite?: string): string {
  const hint = knownWebsite?.trim()
    ? `\nהאתר של העסק (רמז חזק לזיהוי — השתמש בו כדי לוודא שמדובר באותו עסק בדיוק): ${knownWebsite.trim()}`
    : ''
  return `מצא את הקישורים הרשמיים של העסק הישראלי הבא.

שם העסק: ${name}${hint}

חפש באינטרנט ומצא את הפרופילים הרשמיים של העסק הזה בדיוק (לא של עסק אחר עם שם דומה, לא של עמוד אוהדים, לא של עמוד קבוצה/קהילה, לא של עובד פרטי).

כללים מחייבים:
- החזר null לכל שדה שלא מצאת בוודאות. עדיף null מאשר ניחוש.
- אסור להמציא או "לנחש" כתובת URL. רק כתובת שראית בפועל בתוצאות החיפוש.
- לינקדאין: עמוד החברה (/company/...), לא פרופיל אישי.
- אינסטגרם/פייסבוק: עמוד העסק עצמו.
- אתר: הדומיין של העסק עצמו, לא רשת חברתית ולא אינדקס עסקים.

החזר JSON בלבד, ללא טקסט נוסף, בפורמט:
{"website": "https://..." או null, "instagram": "https://..." או null, "facebook": "https://..." או null, "linkedin": "https://..." או null}`
}

async function askGrok(name: string, knownWebsite?: string): Promise<{ raw: Partial<Record<LinkKey, string>>; error?: string }> {
  if (!process.env.XAI_API_KEY) return { raw: {}, error: 'missing_xai_key' }
  try {
    const res = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.XAI_API_KEY}` },
      body: JSON.stringify({
        model: XAI_MODEL,
        input: [{ role: 'user', content: buildPrompt(name, knownWebsite) }],
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
  name: string, knownWebsite?: string, counter?: RequestCounter,
): Promise<AILinkResult> {
  const clean = (name || '').trim()
  if (!clean) return { urls: {}, diagnostics: [], aiError: 'missing_name' }

  const { raw, error } = await askGrok(clean, knownWebsite)
  const urls: Partial<Record<LinkKey, string>> = {}
  const diagnostics: LinkDiag[] = []

  await Promise.all(LINK_KEYS.map(async (key) => {
    const candidate = raw[key]
    if (!candidate) {
      diagnostics.push({ key, outcome: 'not_found', url: '', reason: error || 'ai_returned_null' })
      return
    }
    const v = await validateLink(key, candidate, counter)
    if (v.ok) {
      urls[key] = candidate
      diagnostics.push({ key, outcome: 'found', url: candidate })
    } else {
      // Hallucinated or dead — never surfaced to the admin.
      diagnostics.push({ key, outcome: 'dropped', url: '', candidate, reason: v.reason })
    }
  }))

  diagnostics.sort((a, b) => LINK_KEYS.indexOf(a.key) - LINK_KEYS.indexOf(b.key))
  console.log('[find-links-ai]', clean, JSON.stringify({ raw, diagnostics, aiError: error }))
  return { urls, diagnostics, aiError: error }
}
