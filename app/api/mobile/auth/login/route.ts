export const dynamic = 'force-dynamic'

import { apiError, authClient, clientIp, json, rateGet, rateHit, rateReset, requireHttps, serviceDb } from '@/lib/mobile/core'

const MAX_FAILURES = 5
const WINDOW_SECONDS = 15 * 60

/** POST /api/mobile/auth/login — { email, password } → access + refresh token. */
export async function POST(req: Request) {
  const https = requireHttps(req)
  if (https) return https

  const body = await req.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!email || !password) return apiError(400, 'invalid_request', 'email and password are required.')

  const emailKey = `login:email:${email}`
  const ipKey = `login:ip:${clientIp(req)}`

  // Only FAILED attempts count. Checked before trying, so a locked-out caller
  // can't keep probing passwords. Fails CLOSED if the store is unreachable.
  try {
    const [byEmail, byIp] = await Promise.all([rateGet(emailKey, WINDOW_SECONDS), rateGet(ipKey, WINDOW_SECONDS)])
    const blocked = [byEmail, byIp].filter(r => r.hits >= MAX_FAILURES)
    if (blocked.length) {
      const retry_after = Math.max(...blocked.map(r => r.retryAfter))
      return apiError(429, 'too_many_attempts', 'Too many failed login attempts. Try again later.', { retry_after })
    }
  } catch (e: any) {
    console.error('[mobile/login] rate limit store unavailable:', e?.message)
    return apiError(503, 'unavailable', 'Login is temporarily unavailable.')
  }

  const { data, error } = await authClient().auth.signInWithPassword({ email, password })
  if (error || !data?.session) {
    await Promise.all([rateHit(emailKey, WINDOW_SECONDS), rateHit(ipKey, WINDOW_SECONDS)]).catch(() => {})
    // Same message for unknown email and wrong password (no account enumeration).
    return apiError(401, 'invalid_credentials', 'Invalid email or password.')
  }

  await rateReset(emailKey, ipKey).catch(() => {})

  // The account must own a company (companies.id === auth user id).
  const { data: company } = await serviceDb().from('companies').select('id').eq('id', data.user.id).maybeSingle()
  if (!company) return apiError(403, 'no_company', 'This account has no business profile yet.')

  return json({
    token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    token_type: 'Bearer',
    expires_in: data.session.expires_in,
    expires_at: data.session.expires_at,
    company_id: company.id,
  })
}
