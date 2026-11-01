// Shared plumbing for the mobile JSON API (/api/mobile/*).
//
// Security model:
//  - HTTPS only: plain-HTTP requests are rejected (no redirect — a redirected
//    POST would already have sent the password in clear text).
//  - Bearer auth: the access token is a Supabase Auth JWT, verified with
//    supabase.auth.getUser(token) on every request (signature + expiry + the
//    user still existing).
//  - Company scoping: the server uses the SERVICE ROLE key, which BYPASSES RLS.
//    So scoping is enforced in code: the company id is derived ONLY from the
//    verified token (companies.id === auth user id) — never from the request —
//    and every query goes through scopedDb(companyId), which adds
//    .eq(column, companyId) itself. Callers cannot pass another company's id.
//  - Rate limits live in a shared Supabase table (mobile_rate_limits) because
//    Vercel function instances don't share memory.

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export type ApiError = { error: { code: string; message: string; retry_after?: number } }

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
      ...headers,
    },
  })
}

export function apiError(status: number, code: string, message: string, extra: { retry_after?: number } = {}) {
  const headers: Record<string, string> = {}
  if (extra.retry_after != null) headers['Retry-After'] = String(extra.retry_after)
  if (status === 401) headers['WWW-Authenticate'] = 'Bearer'
  return json({ error: { code, message, ...extra } } satisfies ApiError, status, headers)
}

function isLocalHost(host: string): boolean {
  const h = host.split(':')[0].toLowerCase()
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.localhost')
}

/** Returns an error response for plain-HTTP requests (localhost dev is exempt). */
export function requireHttps(req: Request): NextResponse | null {
  const proto = (req.headers.get('x-forwarded-proto') || new URL(req.url).protocol.replace(':', ''))
    .split(',')[0].trim().toLowerCase()
  const host = req.headers.get('host') || new URL(req.url).host
  if (proto === 'https' || isLocalHost(host)) return null
  return apiError(403, 'https_required', 'This API is only available over HTTPS.')
}

export function clientIp(req: Request): string {
  return (
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    'unknown'
  )
}

const noCookies = { cookies: { getAll: () => [], setAll: () => {} } }

/** Service-role client — bypasses RLS. Only use through scopedDb() for company data. */
export function serviceDb() {
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, noCookies)
}

/** Anon client for Supabase Auth calls (sign-in / refresh). Stateless. */
export function authClient() {
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    ...noCookies,
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  } as any)
}

/**
 * Company-scoped reads. Every query built here is pinned to the authenticated
 * company — the only way company data is read by the mobile API.
 */
export function scopedDb(companyId: string) {
  const db = serviceDb()
  return {
    /** select from a table whose rows belong to a company via `column`. */
    from(table: string, columns: string, column = 'company_id') {
      return db.from(table).select(columns).eq(column, companyId)
    },
    raw: db,
    companyId,
  }
}

// ── Rate limiting (shared store) ────────────────────────────────────────────

/** Atomically count one hit for `key`; returns hits in window + seconds to reset. */
export async function rateHit(key: string, windowSeconds: number): Promise<{ hits: number; retryAfter: number }> {
  const { data, error } = await serviceDb().rpc('mobile_rate_hit', { p_key: key, p_window_seconds: windowSeconds })
  if (error) throw new Error(`rate limit store unavailable: ${error.message}`)
  const row = Array.isArray(data) ? data[0] : data
  const retryAfter = Math.max(1, Math.ceil((new Date(row.reset_at).getTime() - Date.now()) / 1000))
  return { hits: row.hits, retryAfter }
}

/** Current hits for `key` WITHOUT counting a new one (0 when the window expired). */
export async function rateGet(key: string, windowSeconds: number): Promise<{ hits: number; retryAfter: number }> {
  const { data } = await serviceDb().from('mobile_rate_limits').select('count, window_start').eq('key', key).maybeSingle()
  if (!data) return { hits: 0, retryAfter: 0 }
  const resetAt = new Date(data.window_start).getTime() + windowSeconds * 1000
  if (resetAt <= Date.now()) return { hits: 0, retryAfter: 0 }
  return { hits: data.count, retryAfter: Math.ceil((resetAt - Date.now()) / 1000) }
}

export async function rateReset(...keys: string[]) {
  if (keys.length) await serviceDb().from('mobile_rate_limits').delete().in('key', keys)
}

// ── Bearer auth ─────────────────────────────────────────────────────────────

export const AUTHED_LIMIT_PER_MIN = 60

export type MobileAuth = { userId: string; companyId: string }

/**
 * Verifies HTTPS + Bearer token + per-user rate limit. Returns either the
 * authenticated identity or the error response to send.
 */
export async function requireMobileAuth(req: Request): Promise<{ auth: MobileAuth } | { res: NextResponse }> {
  const https = requireHttps(req)
  if (https) return { res: https }

  const header = req.headers.get('authorization') || ''
  const m = header.match(/^Bearer\s+(\S+)$/i)
  if (!m) return { res: apiError(401, 'unauthorized', 'Missing Bearer token.') }

  const { data, error } = await serviceDb().auth.getUser(m[1])
  if (error || !data?.user) return { res: apiError(401, 'invalid_token', 'Token is invalid or expired. Refresh it via /api/mobile/auth/refresh.') }

  // companies.id === auth user id. Derived from the verified token only.
  const companyId = data.user.id

  try {
    const { hits, retryAfter } = await rateHit(`api:${companyId}`, 60)
    if (hits > AUTHED_LIMIT_PER_MIN) {
      return { res: apiError(429, 'rate_limited', 'Too many requests.', { retry_after: retryAfter }) }
    }
  } catch (e: any) {
    // Fail open on the authed limiter (the user is already authenticated);
    // the login limiter fails CLOSED — see the login route.
    console.error('[mobile] authed rate limit unavailable:', e?.message)
  }

  return { auth: { userId: data.user.id, companyId } }
}
