export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { renderReportLinkEmail } from '@/lib/emails/report-link-email'
import { errorDetails } from '@/lib/http/error-report'

/** Public base for client report links — the same one the admin copies. */
const REPORT_BASE = (process.env.REPORT_PUBLIC_BASE_URL || 'https://www.nsradar.co.il').replace(/\/+$/, '')
const FROM = 'North Star Radar <support@nsradar.co.il>'
const REPLY_TO = 'support@nsradar.co.il'

function adminDb() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

/** Light sanity check — Resend does the real validation. */
const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

/**
 * The steps of a send, in order. Every failure response names the step it
 * died in, so "it failed" always comes with "failed WHERE".
 */
type Stage =
  | 'auth'
  | 'parse_request'
  | 'load_company'
  | 'check_company'
  | 'resolve_recipient'
  | 'compose'
  | 'check_config'
  | 'send'

/** Which of the required env vars are present — booleans only, never values. */
function configSnapshot() {
  return {
    RESEND_API_KEY: !!process.env.RESEND_API_KEY,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
  }
}

/**
 * POST { company_id } — email a client the link to their weekly web report.
 *
 * Manual, admin-only, one client per click. Returns 200 ONLY when Resend
 * accepted the message. Every other outcome — including an unexpected throw
 * anywhere in the handler — returns JSON of the form:
 *
 *   { error, stage, details, requestId, config }
 *
 * so the admin sees what failed, where, and with what provider error, and can
 * match it to the server log line carrying the same requestId.
 *
 * The recipient is resolved HERE from the client's auth account; the browser
 * sends only the company id, so a UI bug or a tampered request can never
 * redirect a client's report to an arbitrary address.
 */
export async function POST(request: Request) {
  const requestId = `sre-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  let stage: Stage = 'auth'
  let companyId = ''
  let to = ''

  const fail = (status: number, error: string, details?: unknown) => {
    const payload = {
      error,
      stage,
      details: errorDetails(details),
      requestId,
      ...(to ? { to } : {}),
      config: configSnapshot(),
    }
    console.error(`[send-report-email] FAILED ${requestId} company=${companyId || '?'} stage=${stage} status=${status}:`, JSON.stringify(payload))
    return NextResponse.json(payload, { status })
  }

  // The whole handler is wrapped: an exception at ANY step still produces a
  // structured JSON error. Previously everything before the send ran unguarded,
  // and a throw there surfaced as a bare 500 with no body — "failed, no reason".
  try {
    // ── Admin only ──────────────────────────────────────────────────────────
    const supabase = await createClient()
    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (!user) return fail(401, 'לא מחובר — התחבר מחדש כאדמין', userErr)
    const { data: role, error: roleErr } = await supabase
      .from('user_roles').select('is_admin').eq('user_id', user.id).single()
    if (!role?.is_admin) return fail(403, 'אין הרשאת אדמין', roleErr)

    stage = 'parse_request'
    const body = await request.json().catch(() => ({}))
    companyId = String(body?.company_id || '').trim()
    if (!companyId) return fail(400, 'חסר company_id בבקשה')

    const db = adminDb()

    // ── The company + its permanent report link ─────────────────────────────
    stage = 'load_company'
    const { data: company, error: coErr } = await db
      .from('companies')
      .select('id, name, business_profile, report_token, is_demo')
      .eq('id', companyId)
      .maybeSingle()
    // A query ERROR is reported as such — it used to be folded into "company
    // not found", which hid problems like a missing column or a bad key.
    if (coErr) return fail(500, `שגיאה בטעינת החברה: ${coErr.message}`, coErr)
    if (!company) return fail(404, 'החברה לא נמצאה')

    stage = 'check_company'
    if ((company as any).is_demo) {
      // The demo company's account is synthetic — an email would just bounce.
      return fail(422, 'זו חברת הדמו — לא שולחים לה מייל')
    }
    const token = String((company as any).report_token || '').trim()
    if (!token) {
      return fail(422, 'לחברה אין קישור דוח (report_token) — צור קישור דוח לפני השליחה')
    }
    const reportUrl = `${REPORT_BASE}/r/${encodeURIComponent(token)}`

    // ── The recipient: the client's own login email ─────────────────────────
    // companies.id IS the client's auth user id; there is no separate email
    // column, so the account email is the address on file.
    stage = 'resolve_recipient'
    const { data: authUser, error: authErr } = await db.auth.admin.getUserById(companyId)
    if (authErr) return fail(500, `שגיאה בשליפת חשבון הלקוח: ${authErr.message}`, authErr)
    to = String(authUser?.user?.email || '').trim()
    if (!to) return fail(422, 'אין כתובת מייל ללקוח הזה')
    if (!looksLikeEmail(to)) return fail(422, `כתובת המייל של הלקוח לא תקינה: ${to}`)

    // ── Compose ─────────────────────────────────────────────────────────────
    stage = 'compose'
    const bp: any = (company as any).business_profile || {}
    const companyName = String(bp?.name || (company as any).name || '').trim()
    const { subject, html, text } = renderReportLinkEmail({ companyName, reportUrl })

    // ── Send ────────────────────────────────────────────────────────────────
    stage = 'check_config'
    const key = process.env.RESEND_API_KEY
    if (!key) return fail(500, 'RESEND_API_KEY לא מוגדר בסביבה — לא ניתן לשלוח מיילים')

    stage = 'send'
    const resend = new Resend(key)
    const { data, error } = await resend.emails.send({
      from: FROM,
      replyTo: REPLY_TO,
      to,
      subject,
      html,
      text,
      headers: {
        'List-Unsubscribe': '<mailto:support@nsradar.co.il?subject=unsubscribe>',
        'X-Entity-Ref-ID': `report-link-${companyId}-${Date.now()}`,
      },
      tags: [
        { name: 'category', value: 'report-link' },
        { name: 'trigger', value: 'admin-manual' },
      ],
    })

    if (error) {
      // Resend's own error: name (e.g. validation_error), message, statusCode.
      // Its message is the most useful thing to show — e.g. an unverified
      // sending domain, an invalid recipient, or a bad API key.
      return fail(502, `Resend דחה את השליחה: ${(error as any).message || (error as any).name || 'ללא פירוט'}`, error)
    }
    if (!data?.id) return fail(502, 'Resend לא החזיר מזהה הודעה — לא ברור אם נשלח', data)

    console.log(`[send-report-email] sent ${requestId} company=${companyId} to=${to} id=${data.id}`)
    return NextResponse.json({ sent: true, to, id: data.id, subject, reportUrl, requestId })
  } catch (e: unknown) {
    return fail(500, `שגיאה לא צפויה: ${(e as any)?.message || String(e)}`, e)
  }
}
