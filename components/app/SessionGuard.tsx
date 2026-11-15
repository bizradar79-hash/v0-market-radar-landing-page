'use client'

import { useEffect } from 'react'
import { redirectToLoginExpired } from '@/lib/auth/session-expired'

/**
 * Watches the app's own API calls: any same-origin /api/* response of 401 means
 * the session is gone (expired, or revoked by a password reset) → send the user
 * to login with a clear message instead of leaving a silently broken page.
 * Also reacts to Supabase signalling SIGNED_OUT in this tab.
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
