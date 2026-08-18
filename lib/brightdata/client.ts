// BrightData server client — scrape a URL to markdown, or run a SERP search.
// Same shape as our other external clients (lib/seo/dataforseo): key from env,
// graceful failure (never throws into the caller), one retry, hard timeout.
//
// Used ONLY by the isolated admin competitor-intel dev sandbox. Every response
// is NOISY MARKDOWN TEXT (not clean JSON) — the LLM summarizer does the parsing.

const API_URL = 'https://api.brightdata.com/request'
const SEARCH_URL = 'https://api.brightdata.com/request'
const TIMEOUT_MS = Number(process.env.BRIGHTDATA_TIMEOUT_MS) || 45000
// Unlocker zone that renders JS + returns markdown. Override per account.
const ZONE = process.env.BRIGHTDATA_ZONE || 'web_unlocker1'

export type SourceStatus = 'ok' | 'empty' | 'failed' | 'skipped'

// ── EXACT request counting (for cost) ──────────────────────────────────────
// We count the HTTP requests WE fire rather than querying BrightData's billing
// API: it's exact for our purposes, instant, and adds no external dependency.
// Every attempt (including a retry) is one billable Web Unlocker request.
export const BRIGHTDATA_COST_PER_REQ = Number(process.env.BRIGHTDATA_COST_PER_REQ) || 0.0015

export class RequestCounter {
  /** Web Unlocker requests (website scrapes) — priced per REQUEST. */
  scrapes = 0
  /** SERP discovery searches — also Web Unlocker requests. */
  searches = 0
  /** Dedicated-scraper RECORDS collected (IG/FB/LinkedIn/TikTok posts). */
  records = 0
  get total() { return this.scrapes + this.searches }
  /** Mixed pricing: per-request for Web Unlocker + per-record for datasets. */
  get costUSD() { return this.total * BRIGHTDATA_COST_PER_REQ + this.records * BRIGHTDATA_RECORD_COST }
}

export interface ScrapeResult {
  ok: boolean
  status: SourceStatus
  /** Raw markdown text as returned by BrightData (noisy — nav, menus, etc.). */
  text: string
  error?: string
  url?: string
}

function token(): string | null {
  const t = process.env.BRIGHTDATA_API_TOKEN
  // Treat placeholders as missing so local builds/dev fail gracefully.
  if (!t || t.length < 20 || /placeholder|your[-_]?token|changeme/i.test(t)) return null
  return t
}

/** True when a usable key is configured (UI can show a clear "not configured"). */
export function isBrightDataConfigured(): boolean {
  return token() !== null
}

async function postOnce(body: any, signal: AbortSignal): Promise<{ ok: boolean; text: string; status: number }> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token()}`,
    },
    body: JSON.stringify(body),
    signal,
  })
  const text = await res.text().catch(() => '')
  return { ok: res.ok, text, status: res.status }
}

/** One attempt with its own timeout — so a hung request can never block a run. */
async function attempt(body: any): Promise<{ ok: boolean; text: string; status: number }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    return await postOnce(body, ctrl.signal)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Scrape any URL → raw markdown. Retries ONCE on failure/timeout (BrightData
 * occasionally times out on social pages), then returns a clear per-source error.
 * NEVER throws — each source must fail independently without blocking the others.
 */
export async function scrapeUrl(url: string, counter?: RequestCounter): Promise<ScrapeResult> {
  const clean = (url || '').trim()
  if (!clean) return { ok: false, status: 'skipped', text: '', error: 'no_url' }
  if (!/^https?:\/\//i.test(clean)) return { ok: false, status: 'skipped', text: '', error: 'invalid_url', url: clean }
  if (!token()) return { ok: false, status: 'failed', text: '', error: 'missing_brightdata_token', url: clean }

  const body = { zone: ZONE, url: clean, format: 'raw', data_format: 'markdown' }

  for (let i = 0; i < 2; i++) {
    try {
      if (counter) counter.scrapes++   // each attempt (incl. retry) is billable
      const r = await attempt(body)
      if (r.ok) {
        const text = (r.text || '').trim()
        if (!text) return { ok: false, status: 'empty', text: '', error: 'empty_response', url: clean }
        return { ok: true, status: 'ok', text, url: clean }
      }
      if (i === 1) return { ok: false, status: 'failed', text: '', error: `http_${r.status}: ${r.text.slice(0, 160)}`, url: clean }
    } catch (e: any) {
      const msg = e?.name === 'AbortError' ? `timeout_${TIMEOUT_MS}ms` : (e?.message || 'fetch_failed')
      if (i === 1) return { ok: false, status: 'failed', text: '', error: msg, url: clean }
    }
  }
  return { ok: false, status: 'failed', text: '', error: 'unknown', url: clean }
}

export interface SearchHit { title: string; url: string }

/**
 * SERP search — used to AUTO-DISCOVER a competitor's profile URL when the admin
 * didn't provide one (e.g. "<name> instagram"). Returns links parsed out of the
 * markdown SERP. Best-effort; empty array on any failure.
 */
export async function searchWeb(query: string, limit = 10, counter?: RequestCounter): Promise<SearchHit[]> {
  const q = (query || '').trim()
  if (!q || !token()) return []
  const body = {
    zone: ZONE,
    url: `https://www.google.com/search?q=${encodeURIComponent(q)}&num=${limit}&hl=he&gl=il`,
    format: 'raw',
    data_format: 'markdown',
  }
  try {
    if (counter) counter.searches++
    const r = await attempt(body)
    if (!r.ok || !r.text) return []
    // Markdown links: [title](url) — keep real http(s) targets, drop google's own.
    const hits: SearchHit[] = []
    const seen = new Set<string>()
    const re = /\[([^\]]{2,120})\]\((https?:\/\/[^)\s]+)\)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(r.text)) !== null) {
      const url = m[2]
      if (/google\.|gstatic|googleusercontent|\/search\?/i.test(url)) continue
      if (seen.has(url)) continue
      seen.add(url)
      hits.push({ title: m[1].trim(), url })
      if (hits.length >= limit) break
    }
    return hits
  } catch {
    return []
  }
}

/** Find the best profile URL for a competitor on a given platform host. */
export async function discoverProfileUrl(name: string, hostFragment: string, counter?: RequestCounter): Promise<string> {
  const hits = await searchWeb(`${name} ${hostFragment}`, 10, counter)
  const hit = hits.find((h) => h.url.toLowerCase().includes(hostFragment.toLowerCase()))
  return hit?.url || ''
}

// ───────────────────────────────────────────────────────────────────────────
// DEDICATED SCRAPER PATH (BrightData Datasets API) — TEMPLATE
//
// The generic Web Unlocker (scrapeUrl) returns EMPTY for TikTok, so TikTok uses
// BrightData's dedicated dataset scraper instead. That API is ASYNC:
//   1. POST /datasets/v3/trigger?dataset_id=…&include_errors=true   → snapshot_id
//   2. GET  /datasets/v3/progress/{snapshot_id}                     → status
//   3. GET  /datasets/v3/snapshot/{snapshot_id}?format=json         → rows
// Returns a NORMALIZED shape (structured posts, not markdown) — this is the
// template the other four sources will migrate to once proven in prod.
// ───────────────────────────────────────────────────────────────────────────

const DATASETS_BASE = 'https://api.brightdata.com/datasets/v3'

// Platform → BrightData dataset id (trigger-by-URL Web Scraper API).
// Confirmed ids as defaults; each overridable via env without a redeploy.
export type SocialPlatform = 'tiktok' | 'linkedin' | 'instagram' | 'facebook'
export const DATASET_IDS: Record<SocialPlatform, string> = {
  tiktok: process.env.BRIGHTDATA_TIKTOK_DATASET_ID || '',
  linkedin: process.env.BRIGHTDATA_LINKEDIN_DATASET_ID || 'gd_lyy3tktm25m4avu764',
  instagram: process.env.BRIGHTDATA_INSTAGRAM_DATASET_ID || 'gd_lk5ns7kz21pck8jpis',
  facebook: process.env.BRIGHTDATA_FACEBOOK_DATASET_ID || 'gd_lkaxegm826bjpoo9m5',
}
// Dedicated scrapers bill per RECORD collected (marketplace price), unlike the
// Web Unlocker's per-request price. Env-tunable.
export const BRIGHTDATA_RECORD_COST = Number(process.env.BRIGHTDATA_RECORD_COST) || 0.0025
const POLL_TIMEOUT_MS = Number(process.env.BRIGHTDATA_POLL_TIMEOUT_MS) || 90000
const POLL_INTERVAL_MS = Number(process.env.BRIGHTDATA_POLL_INTERVAL_MS) || 5000

export interface SocialPost {
  caption: string
  /** ISO date when available (dataset gives real timestamps). */
  date: string
  likes?: number | null
  comments?: number | null
  shares?: number | null
  views?: number | null
  hashtags?: string[]
  videoUrl?: string
  postUrl?: string
}

export interface ProfileMeta {
  followers?: number | null
  bio?: string
  name?: string
}

export interface StructuredScrapeResult {
  ok: boolean
  status: SourceStatus | 'processing'
  posts: SocialPost[]
  profile?: ProfileMeta
  error?: string
  url?: string
}

const num = (v: any): number | null => {
  const n = typeof v === 'string' ? Number(v.replace(/[^\d.]/g, '')) : v
  return typeof n === 'number' && isFinite(n) ? n : null
}
const str = (v: any): string => (typeof v === 'string' ? v.trim() : '')

/** Pick the first present key from a row — dataset field names vary by version. */
const pick = (row: any, keys: string[]): any => {
  for (const k of keys) if (row?.[k] !== undefined && row[k] !== null && row[k] !== '') return row[k]
  return undefined
}

/**
 * Normalize one dataset row → SocialPost, PER PLATFORM. Each dataset names its
 * fields differently; we list every known variant per platform (most specific
 * first) and fall back to shared aliases, so a schema tweak on BrightData's side
 * degrades to a missing field rather than a broken source.
 */
const FIELD_MAP: Record<SocialPlatform, {
  caption: string[]; date: string[]; likes: string[]; comments: string[]
  shares: string[]; views: string[]; hashtags: string[]; video: string[]; post: string[]
  followers: string[]; bio: string[]; name: string[]
}> = {
  tiktok: {
    caption: ['description', 'caption', 'title'], date: ['create_time', 'date_posted', 'timestamp'],
    likes: ['digg_count', 'likes'], comments: ['comment_count', 'comments'],
    shares: ['share_count', 'shares'], views: ['play_count', 'views'],
    hashtags: ['hashtags', 'hash_tags'], video: ['video_url', 'video'], post: ['post_url', 'web_video_url', 'url'],
    followers: ['profile_followers', 'followers'], bio: ['profile_biography', 'biography'], name: ['profile_username', 'account_id'],
  },
  instagram: {
    caption: ['caption', 'description', 'post_content'], date: ['date_posted', 'timestamp', 'taken_at'],
    likes: ['likes', 'num_likes', 'like_count'], comments: ['num_comments', 'comments', 'comment_count'],
    shares: ['shares'], views: ['video_play_count', 'views', 'video_view_count'],
    hashtags: ['hashtags'], video: ['video_url'], post: ['url', 'post_url', 'permalink'],
    followers: ['followers', 'profile_followers', 'follower_count'], bio: ['biography', 'bio'], name: ['user_posted', 'username', 'profile_name'],
  },
  facebook: {
    caption: ['content', 'post_text', 'description', 'caption'], date: ['date_posted', 'timestamp', 'created_time'],
    likes: ['likes', 'num_likes', 'reactions', 'num_reactions'], comments: ['num_comments', 'comments'],
    shares: ['num_shares', 'shares'], views: ['video_view_count', 'views'],
    hashtags: ['hashtags'], video: ['video_url', 'attachment_url'], post: ['url', 'post_url', 'link'],
    followers: ['page_followers', 'followers', 'likes_count'], bio: ['page_intro', 'about', 'biography'], name: ['page_name', 'user_username_raw', 'author'],
  },
  linkedin: {
    caption: ['post_text', 'headline', 'title', 'text'], date: ['date_posted', 'post_date', 'time', 'timestamp'],
    likes: ['num_likes', 'likes', 'reactions'], comments: ['num_comments', 'comments'],
    shares: ['num_shares', 'shares', 'reposts'], views: ['views', 'num_views'],
    hashtags: ['hashtags', 'tagged_hashtags'], video: ['video_url'], post: ['url', 'post_url', 'link'],
    followers: ['followers', 'company_followers', 'num_followers'], bio: ['about', 'description', 'company_about'], name: ['company_name', 'user_id', 'account_name'],
  },
}

// Shared fallbacks tried after the platform-specific keys.
const COMMON = {
  caption: ['description', 'caption', 'title', 'text', 'content'],
  date: ['date_posted', 'created_at', 'timestamp', 'date', 'time'],
  likes: ['likes', 'like_count', 'num_likes'], comments: ['comments', 'comment_count', 'num_comments'],
  shares: ['shares', 'share_count', 'num_shares'], views: ['views', 'view_count', 'play_count'],
  hashtags: ['hashtags', 'tags'], video: ['video_url', 'media_url'], post: ['url', 'post_url', 'link'],
  followers: ['followers', 'follower_count'], bio: ['biography', 'bio', 'about'], name: ['name', 'username'],
}

/** Parse any of the date shapes datasets emit: unix sec, unix ms, or ISO text. */
function toIsoDate(v: any): string {
  if (v == null || v === '') return ''
  const n = typeof v === 'number' ? v : Number(v)
  if (isFinite(n) && n > 1e9) return new Date(n > 1e12 ? n : n * 1000).toISOString()
  const d = new Date(String(v))
  return isNaN(d.getTime()) ? '' : d.toISOString()
}

function toPost(row: any, platform: SocialPlatform): SocialPost {
  const m = FIELD_MAP[platform]
  const g = (keys: string[], common: string[]) => pick(row, [...keys, ...common])
  const hashtagsRaw = g(m.hashtags, COMMON.hashtags)
  const hashtags = Array.isArray(hashtagsRaw)
    ? hashtagsRaw.map((h: any) => (typeof h === 'string' ? h : str(h?.name || h?.hashtag))).filter(Boolean)
    : typeof hashtagsRaw === 'string' ? hashtagsRaw.split(/[,\s]+/).filter(Boolean) : []
  return {
    caption: str(g(m.caption, COMMON.caption)),
    date: toIsoDate(g(m.date, COMMON.date)),
    likes: num(g(m.likes, COMMON.likes)),
    comments: num(g(m.comments, COMMON.comments)),
    shares: num(g(m.shares, COMMON.shares)),
    views: num(g(m.views, COMMON.views)),
    hashtags,
    videoUrl: str(g(m.video, COMMON.video)),
    postUrl: str(g(m.post, COMMON.post)),
  }
}

function toProfile(row: any, platform: SocialPlatform): ProfileMeta {
  const m = FIELD_MAP[platform]
  return {
    followers: num(pick(row, [...m.followers, ...COMMON.followers])),
    bio: str(pick(row, [...m.bio, ...COMMON.bio])),
    name: str(pick(row, [...m.name, ...COMMON.name])),
  }
}

async function bdFetch(url: string, init: RequestInit, timeoutMs = TIMEOUT_MS) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}`, ...(init.headers || {}) },
      signal: ctrl.signal,
    })
  } finally { clearTimeout(timer) }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Scrape a social profile's recent posts via BrightData's DEDICATED dataset
 * scraper (trigger → poll → results). Works for TikTok, Instagram, Facebook and
 * LinkedIn — one flow, per-platform field mapping. Never hangs (hard poll
 * deadline) and never throws; returns 'processing' when the snapshot isn't ready
 * in time so the admin can simply re-run instead of seeing a false failure.
 */
export async function scrapeSocialProfile(
  platform: SocialPlatform, profileUrl: string, counter?: RequestCounter,
): Promise<StructuredScrapeResult> {
  const url = (profileUrl || '').trim()
  if (!url) return { ok: false, status: 'skipped', posts: [], error: 'no_url' }
  if (!token()) return { ok: false, status: 'failed', posts: [], error: 'missing_brightdata_token', url }
  const datasetId = DATASET_IDS[platform]
  if (!datasetId) return { ok: false, status: 'failed', posts: [], error: `missing_dataset_id_for_${platform}`, url }

  // 1. TRIGGER — collect by profile URL.
  let snapshotId = ''
  for (let i = 0; i < 2; i++) { // retry once on transient errors
    try {
      const res = await bdFetch(
        `${DATASETS_BASE}/trigger?dataset_id=${encodeURIComponent(datasetId)}&include_errors=true`,
        { method: 'POST', body: JSON.stringify([{ url }]) },
      )
      const text = await res.text().catch(() => '')
      if (res.ok) {
        try { snapshotId = JSON.parse(text)?.snapshot_id || '' } catch { snapshotId = '' }
        if (snapshotId) break
        return { ok: false, status: 'failed', posts: [], error: `no_snapshot_id: ${text.slice(0, 160)}`, url }
      }
      if (i === 1) return { ok: false, status: 'failed', posts: [], error: `trigger_http_${res.status}: ${text.slice(0, 160)}`, url }
    } catch (e: any) {
      if (i === 1) return { ok: false, status: 'failed', posts: [], error: e?.name === 'AbortError' ? 'trigger_timeout' : (e?.message || 'trigger_failed'), url }
    }
  }

  // 2. POLL progress until ready (hard deadline).
  const deadline = Date.now() + POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS)
    try {
      const res = await bdFetch(`${DATASETS_BASE}/progress/${snapshotId}`, { method: 'GET' }, 20000)
      const body = await res.json().catch(() => ({}))
      const status = String(body?.status || '').toLowerCase()
      if (status === 'ready') break
      if (status === 'failed' || body?.error) {
        return { ok: false, status: 'failed', posts: [], error: `snapshot_${status || 'error'}: ${String(body?.error || '').slice(0, 160)}`, url }
      }
    } catch { /* transient — keep polling until the deadline */ }
  }
  if (Date.now() >= deadline) {
    return { ok: false, status: 'processing', posts: [], error: `still_processing_after_${Math.round(POLL_TIMEOUT_MS / 1000)}s (snapshot ${snapshotId}) — נסה שוב בעוד רגע`, url }
  }

  // 3. RESULTS.
  try {
    const res = await bdFetch(`${DATASETS_BASE}/snapshot/${snapshotId}?format=json`, { method: 'GET' }, 45000)
    const text = await res.text().catch(() => '')
    if (!res.ok) return { ok: false, status: 'failed', posts: [], error: `snapshot_http_${res.status}: ${text.slice(0, 160)}`, url }

    let rows: any[] = []
    try {
      const parsed = JSON.parse(text)
      rows = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.data) ? parsed.data : [])
    } catch {
      // NDJSON fallback (datasets sometimes stream one JSON object per line).
      rows = text.split('\n').map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
    }
    const valid = rows.filter((r) => r && !r.error)
    // Cost: dedicated scrapers bill per RECORD collected.
    if (counter) counter.records += valid.length
    if (valid.length === 0) return { ok: false, status: 'empty', posts: [], error: 'no_rows', url }

    const posts = valid.map((r) => toPost(r, platform)).filter((p) => p.caption || p.date || p.postUrl)
    const profile = toProfile(valid[0], platform)
    if (posts.length === 0) return { ok: false, status: 'empty', posts: [], profile, error: 'no_posts_parsed', url }
    return { ok: true, status: 'ok', posts, profile, url }
  } catch (e: any) {
    return { ok: false, status: 'failed', posts: [], error: e?.name === 'AbortError' ? 'snapshot_timeout' : (e?.message || 'snapshot_failed'), url }
  }
}

/** Back-compat alias — TikTok goes through the same generalized function. */
export const scrapeTikTokProfile = (profileUrl: string, counter?: RequestCounter) =>
  scrapeSocialProfile('tiktok', profileUrl, counter)

/** Render normalized posts as readable text for the LLM summarizer. */
export function postsToText(posts: SocialPost[], profile?: ProfileMeta): string {
  const head = profile
    ? `פרופיל: ${profile.name || ''}${profile.followers != null ? ` · ${profile.followers.toLocaleString()} עוקבים` : ''}${profile.bio ? `\n${profile.bio}` : ''}\n\n`
    : ''
  const body = posts.map((p) => {
    const d = p.date ? new Date(p.date).toISOString().slice(0, 10) : 'ללא תאריך'
    const eng = [
      p.views != null ? `${p.views.toLocaleString()} צפיות` : '',
      p.likes != null ? `${p.likes.toLocaleString()} לייקים` : '',
      p.comments != null ? `${p.comments.toLocaleString()} תגובות` : '',
      p.shares != null ? `${p.shares.toLocaleString()} שיתופים` : '',
    ].filter(Boolean).join(' · ')
    const tags = p.hashtags?.length ? `\n  תגיות: ${p.hashtags.slice(0, 10).join(' ')}` : ''
    return `- [${d}] ${p.caption || '(ללא כיתוב)'}${eng ? `\n  ${eng}` : ''}${tags}${p.postUrl ? `\n  ${p.postUrl}` : ''}`
  }).join('\n')
  return head + body
}
