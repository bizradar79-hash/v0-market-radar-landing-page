export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { renderReportLinkEmail } from '@/lib/emails/report-link-email'

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
 * POST { company_id } — email a client the link to their weekly web report.
 *
 * Manual, admin-only, one client per click. Every outcome is reported
 * honestly: this returns 200 ONLY when Resend accepted the message. A missing
 * address, missing report link or provider error is a non-200 with a Hebrew
 * reason the admin toast can show as-is — never a false green check.
 *
 * The recipient is resolved HERE from the client's auth account. The browser
 * sends only the company id, so a UI bug or a tampered request can never
 * redirect a client's report to an arbitrary address.
 */
export async function POST(request: Request) {
  // ── Admin only ────────────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: role } = await supabase
    .from('user_roles').select('is_admin').eq('user_id', user.id).single()
  if (!role?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const companyId = String(body?.company_id || '').trim()
  if (!companyId) return NextResponse.json({ error: 'חסר company_id' }, { status: 400 })

  const db = adminDb()

  // ── The company + its permanent report link ───────────────────────────────
  const { data: company, error: coErr } = await db
    .from('companies')
    .select('id, name, business_profile, report_token, is_demo')
    .eq('id', companyId)
    .single()
  if (coErr || !company) {
    return NextResponse.json({ error: 'החברה לא נמצאה' }, { status: 404 })
  }
  if ((company as any).is_demo) {
    // The demo company's account is synthetic — an email would just bounce.
    return NextResponse.json({ error: 'זו חברת הדמו — לא שולחים לה מייל' }, { status: 422 })
  }
  const token = String((company as any).report_token || '').trim()
  if (!token) {
    return NextResponse.json(
      { error: 'לחברה אין קישור דוח (report_token) — צור קישור דוח לפני השליחה' },
      { status: 422 },
    )
  }
  const reportUrl = `${REPORT_BASE}/r/${encodeURIComponent(token)}`

  // ── The recipient: the client's own login email ───────────────────────────
  // companies.id IS the client's auth user id; there is no separate email
  // column, so the account email is the address on file.
  const { data: authUser, error: authErr } = await db.auth.admin.getUserById(companyId)
  const to = String(authUser?.user?.email || '').trim()
  if (authErr || !to) {
    return NextResponse.json({ error: 'אין כתובת מייל ללקוח הזה' }, { status: 422 })
  }
  if (!looksLikeEmail(to)) {
    return NextResponse.json({ error: `כתובת המייל של הלקוח לא תקינה: ${to}` }, { status: 422 })
  }

  // ── Compose ───────────────────────────────────────────────────────────────
  const bp: any = (company as any).business_profile || {}
  const companyName = String(bp?.name || (company as any).name || '').trim()
  const { subject, html, text } = renderReportLinkEmail({ companyName, reportUrl })

  // ── Send ──────────────────────────────────────────────────────────────────
  const key = process.env.RESEND_API_KEY
  if (!key) {
    return NextResponse.json({ error: 'RESEND_API_KEY לא מוגדר — לא ניתן לשלוח מיילים' }, { status: 500 })
  }

  try {
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

    if (error || !data?.id) {
      const reason = (error as any)?.message || 'Resend לא החזיר מזהה הודעה'
      console.error(`[send-report-email] FAILED company=${companyId} to=${to}:`, reason)
      return NextResponse.json({ error: `השליחה נכשלה: ${reason}`, to }, { status: 502 })
    }

    console.log(`[send-report-email] sent company=${companyId} to=${to} id=${data.id}`)
    return NextResponse.json({ sent: true, to, id: data.id, subject, reportUrl })
  } catch (e: any) {
    console.error(`[send-report-email] threw company=${companyId}:`, e?.message)
    return NextResponse.json({ error: `השליחה נכשלה: ${e?.message || 'שגיאה לא ידועה'}`, to }, { status: 502 })
  }
}
