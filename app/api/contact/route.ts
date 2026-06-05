export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { Resend } from 'resend'

// Simple in-memory per-IP rate limit (best-effort; resets on cold start).
const RATE_LIMIT_WINDOW_MS = 60_000 // 1 minute
const RATE_LIMIT_MAX = 5
const hits = new Map<string, number[]>()

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  arr.push(now)
  hits.set(ip, arr)
  return arr.length > RATE_LIMIT_MAX
}

function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return request.headers.get('x-real-ip') || 'unknown'
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function POST(request: Request) {
  let body: any = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'בקשה לא תקינה' }, { status: 400 })
  }

  // Honeypot — bots fill the hidden "website" field. Silently drop as success.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return NextResponse.json({ ok: true })
  }

  const name = String(body.name ?? '').trim()
  const phone = String(body.phone ?? '').trim()
  const email = String(body.email ?? '').trim()
  const message = String(body.message ?? '').trim()

  // Server-side validation.
  if (!name || name.length < 2 || name.length > 100) {
    return NextResponse.json({ ok: false, error: 'נא להזין שם תקין' }, { status: 400 })
  }
  if (!phone || !/^[\d+\-()\s]{6,20}$/.test(phone)) {
    return NextResponse.json({ ok: false, error: 'נא להזין מספר טלפון תקין' }, { status: 400 })
  }
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150)) {
    return NextResponse.json({ ok: false, error: 'נא להזין אימייל תקין' }, { status: 400 })
  }
  if (message.length > 3000) {
    return NextResponse.json({ ok: false, error: 'ההודעה ארוכה מדי' }, { status: 400 })
  }

  if (rateLimited(clientIp(request))) {
    return NextResponse.json({ ok: false, error: 'נשלחו יותר מדי בקשות. נסו שוב מאוחר יותר.' }, { status: 429 })
  }

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    // Don't leak config details to the client.
    console.error('[contact] RESEND_API_KEY not configured')
    return NextResponse.json({ ok: false, error: 'שירות הדוא"ל אינו זמין כרגע' }, { status: 500 })
  }

  const timestamp = new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date())

  const html = `
    <div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
      <h2 style="margin:0 0 12px;">פנייה חדשה מהאתר</h2>
      <p><strong>שם:</strong> ${escapeHtml(name)}</p>
      <p><strong>טלפון:</strong> ${escapeHtml(phone)}</p>
      <p><strong>אימייל:</strong> ${email ? escapeHtml(email) : '—'}</p>
      <p><strong>הודעה:</strong><br/>${escapeHtml(message || '—').replace(/\n/g, '<br/>')}</p>
      <hr style="border:none;border-top:1px solid #eee;margin:16px 0;" />
      <p style="font-size:12px;color:#888;">נשלח: ${timestamp}</p>
    </div>
  `

  const text = [
    'פנייה חדשה מהאתר',
    `שם: ${name}`,
    `טלפון: ${phone}`,
    `אימייל: ${email || '—'}`,
    `הודעה: ${message || '—'}`,
    `נשלח: ${timestamp}`,
  ].join('\n')

  try {
    const resend = new Resend(resendKey)
    const payload: any = {
      from: 'North Star Radar <support@nsradar.co.il>',
      to: 'shay@nsradar.co.il',
      subject: `פנייה חדשה מהאתר — ${name}`,
      html,
      text,
    }
    if (email) payload.replyTo = email

    const { error } = await resend.emails.send(payload)
    if (error) {
      console.error('[contact] resend error:', error.message)
      return NextResponse.json({ ok: false, error: 'שליחת הפנייה נכשלה. נסו שוב.' }, { status: 500 })
    }
  } catch (e: any) {
    console.error('[contact] send failed:', e?.message)
    return NextResponse.json({ ok: false, error: 'שליחת הפנייה נכשלה. נסו שוב.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
