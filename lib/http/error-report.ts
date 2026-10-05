// Shared error shaping for admin actions — server and client halves.
//
// The goal is that a failed admin action ALWAYS explains itself: what failed,
// at which step, with what provider/database error, and which request it was.
// Kept free of framework imports so both sides (and the tests) can use it.

/**
 * Normalize any error shape — Supabase PostgrestError / AuthError, Resend's
 * error object, a thrown Error, or a string — into a JSON-safe record.
 * Only known diagnostic fields are copied: never credentials or headers.
 */
export function errorDetails(e: unknown): Record<string, unknown> {
  if (e == null) return {}
  if (typeof e === 'string') return { message: e }
  if (typeof e !== 'object') return { message: String(e) }
  const o = e as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const k of ['name', 'message', 'code', 'statusCode', 'status', 'details', 'hint']) {
    const v = o[k]
    if (v != null && v !== '' && (typeof v !== 'object')) out[k] = v
  }
  if (e instanceof Error && !out.message) out.message = e.message
  return out
}

export interface FailureReport {
  /** One line for a toast. */
  summary: string
  /** Everything we know, for copying into a bug report. */
  full: string
}

/**
 * Describe a failed HTTP response from its status and raw body. Handles bodies
 * that are NOT JSON — a platform timeout page, a crash before the handler could
 * answer, a 404 because the route isn't deployed — which otherwise surface as a
 * failure with no message at all.
 */
export function describeFailure(status: number, statusText: string, rawBody: string): FailureReport {
  const httpLine = `HTTP ${status}${statusText ? ` ${statusText}` : ''}`
  let data: any = null
  try { data = rawBody ? JSON.parse(rawBody) : null } catch { /* not JSON */ }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    const hint =
      status === 404 ? 'הנתיב לא נמצא — ייתכן שהפריסה האחרונה עוד לא עלתה'
      : status === 504 || status === 408 ? 'תם הזמן — השרת לא ענה בזמן'
      : status >= 500 ? 'השרת קרס לפני שהחזיר פירוט — ראה לוגים ב-Vercel'
      : 'התגובה לא הכילה פירוט שגיאה'
    const snippet = rawBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300)
    return {
      summary: `${httpLine} — ${hint}`,
      full: [httpLine, hint, snippet && `גוף התגובה: ${snippet}`].filter(Boolean).join('\n'),
    }
  }

  const d = data.details && typeof data.details === 'object' && Object.keys(data.details).length ? data.details : null
  const code = d?.statusCode ?? d?.code ?? d?.status
  const parts: string[] = [data.error || 'שגיאה ללא הודעה']
  if (data.stage) parts.push(`שלב: ${data.stage}`)
  if (d?.name && d.name !== 'Error') parts.push(`סוג: ${d.name}`)
  if (code != null) parts.push(`קוד: ${code}`)
  parts.push(httpLine)
  const missing = data.config && typeof data.config === 'object'
    ? Object.entries(data.config).filter(([, ok]) => !ok).map(([k]) => k)
    : []
  if (missing.length) parts.push(`חסר בסביבה: ${missing.join(', ')}`)

  return { summary: parts.join(' · '), full: JSON.stringify({ http: httpLine, ...data }, null, 2) }
}
