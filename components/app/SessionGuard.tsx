'use client'

import { useEffect } from 'react'
import { redirectToLoginExpired } from '@/lib/auth/session-expired'

/**
 * Watches the app's own API calls. A same-origin /api/* 401 is only a HINT:
 * redirectToLoginExpired() then asks Supabase Auth whether the session is
 * really gone, and redirects to login only if it is. A 401 from one endpoint
 * (e.g. /api/saved-items for an account with no companies row — the admin)
 * with a valid session does nothing.
 */
export default function SessionGuard() {
  useEffect(() => {
    const original = window.fetch
    const guarded: typeof window.fetch = async (input, init) => {
      const res = await original(input, init)
      try {
        if (res.status === 401) {
          const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
          const url = new URL(raw, window.location.origin)
          if (url.origin === window.location.origin && url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/mobile/')) {
            redirectToLoginExpired()
          }
        }
      } catch {}
      return res
    }
    window.fetch = guarded
    return () => { if (window.fetch === guarded) window.fetch = original }
  }, [])

  return null
}
