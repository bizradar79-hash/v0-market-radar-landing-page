'use client'

// Expired / revoked session handling for the web app.
//
// A session can die under a logged-in tab: the access token expires and the
// refresh token was revoked (e.g. a password reset revokes old tokens). Then
// server calls return 401 and the UI just looked broken ("save does nothing").
// In that case — and ONLY that case — send the user to /login with a clear
// Hebrew message, and bring them back to the page they were on.
//
// IMPORTANT: a 401 from an endpoint is NOT proof the session is gone. Many
// routes return 401 for other reasons — notably getFullContext() returns null
// (→ 401) when the user has no `companies` row, which is the case for the admin
// account. Treating every 401 as "logged out" signed the admin out on every
// page load (sidebar → /api/saved-items → 401) → login → in → 401 → loop.
// So before doing anything we ask Supabase Auth directly; a valid user means
// we do nothing at all — never sign out, never redirect.

import { createClient } from '@/lib/supabase/client'

export const SESSION_EXPIRED_MESSAGE = 'ההתחברות פגה — התחבר מחדש כדי להמשיך'

const LAST_REDIRECT_KEY = 'session_expired_redirect_at'
const REDIRECT_COOLDOWN_MS = 30_000

let checking: Promise<boolean> | null = null

/** Safe in-app return path (only /app/* — never an external URL). */
export function safeNextPath(next: string | null | undefined): string | null {
  return typeof next === 'string' && /^\/app(\/|$)/.test(next) && !next.startsWith('//') ? next : null
}

/**
 * True only when Supabase Auth itself says there is no valid session.
 * Network / server errors are NOT treated as logged out (fail safe: stay in).
 */
export async function isSessionInvalid(): Promise<boolean> {
  try {
    const { data, error } = await createClient().auth.getUser()
    if (data?.user) return false
    if (!error) return true
    const status = (error as any).status as number | undefined
    // AuthSessionMissingError (no status), or 401/403 from the auth server
    // (expired / revoked / user deleted) → genuinely invalid.
    if (error.name === 'AuthSessionMissingError' || status === 401 || status === 403) return true
    return false // network / 5xx — can't tell; don't eject.
  } catch {
    return false
  }
}

/**
 * Verify the session; redirect to /login?reason=expired ONLY if it is really
 * invalid. Returns true if it redirected. Idempotent, with a cooldown so it can
 * never loop.
 */
export async function redirectToLoginExpired(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (window.location.pathname.startsWith('/login')) return false

  // Coalesce concurrent 401s into one check.
  if (!checking) {
    checking = isSessionInvalid().finally(() => { setTimeout(() => { checking = null }, 5_000) })
  }
  const invalid = await checking
  if (!invalid) return false

  // Loop guard: at most one forced redirect per 30s per tab.
  try {
    const last = Number(sessionStorage.getItem(LAST_REDIRECT_KEY) || 0)
    if (Date.now() - last < REDIRECT_COOLDOWN_MS) return false
    sessionStorage.setItem(LAST_REDIRECT_KEY, String(Date.now()))
  } catch {}

  // The session is already dead server-side; clear its leftover local cookies.
  try { await createClient().auth.signOut({ scope: 'local' }) } catch {}

  const next = safeNextPath(window.location.pathname + window.location.search)
  const qs = new URLSearchParams({ reason: 'expired' })
  if (next) qs.set('next', next)
  window.location.assign(`/login?${qs.toString()}`)
  return true
}
