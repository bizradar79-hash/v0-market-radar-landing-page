export const dynamic = 'force-dynamic'

import { apiError, authClient, clientIp, json, rateHit, requireHttps } from '@/lib/mobile/core'

/** POST /api/mobile/auth/refresh — { refresh_token } → new access + refresh token. */
export async function POST(req: Request) {
  const https = requireHttps(req)
  if (https) return https

  // Light abuse guard: 30 refreshes / 15 min per IP (a normal app needs ~1/hour).
  try {
    const { hits, retryAfter } = await rateHit(`refresh:ip:${clientIp(req)}`, 15 * 60)
    if (hits > 30) return apiError(429, 'rate_limited', 'Too many requests.', { retry_after: retryAfter })
  } catch (e: any) {
    console.error('[mobile/refresh] rate limit store unavailable:', e?.message)
  }

  const body = await req.json().catch(() => null)
  const refresh_token = typeof body?.refresh_token === 'string' ? body.refresh_token.trim() : ''
  if (!refresh_token) return apiError(400, 'invalid_request', 'refresh_token is required.')

  const { data, error } = await authClient().auth.refreshSession({ refresh_token })
  if (error || !data?.session) {
    return apiError(401, 'invalid_refresh_token', 'Refresh token is invalid, expired or already used. Log in again.')
  }

  // Supabase rotates refresh tokens: the app MUST store the new one.
  return json({
    token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    token_type: 'Bearer',
    expires_in: data.session.expires_in,
    expires_at: data.session.expires_at,
    company_id: data.session.user.id,
  })
}
