'use client'

// Expired / revoked session handling for the web app.
//
// A session can die under a logged-in tab: the access token expires and the
// refresh token was revoked (e.g. a password reset revokes old tokens). Before
// this, every server call then returned 401 and the UI just looked broken
// ("save does nothing"). Now any such 401 sends the user to /login with a
// clear Hebrew message, and they come back to the page they were on.

import { createClient } from '@/lib/supabase/client'

export const SESSION_EXPIRED_MESSAGE = 'ההתחברות פגה — התחבר מחדש כדי להמשיך'

let redirecting = false

/** Safe in-app return path (only /app/* — never an external URL). */
export function safeNextPath(next: string | null | undefined): string | null {
  return typeof next === 'string' && /^\/app(\/|$)/.test(next) && !next.startsWith('//') ? next : null
}

/** Clear the dead local session and go to /login?reason=expired. Idempotent. */
export async function redirectToLoginExpired(): Promise<void> {
  if (redirecting || typeof window === 'undefined') return
  if (window.location.pathname.startsWith('/login')) return
  redirecting = true
  try {
    // Local-only sign-out: drops the stale cookies without a server round-trip
    // (the server session is already gone).
    await createClient().auth.signOut({ scope: 'local' })
  } catch {}
  const next = safeNextPath(window.location.pathname + window.location.search)
  const qs = new URLSearchParams({ reason: 'expired' })
  if (next) qs.set('next', next)
  window.location.assign(`/login?${qs.toString()}`)
}
