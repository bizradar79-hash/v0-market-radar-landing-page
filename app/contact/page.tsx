'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import Link from 'next/link'

const WA_BASE = 'https://wa.me/972559137417'

export default function ContactPage() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [website, setWebsite] = useState('') // honeypot

  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  function waFollowUpUrl(): string {
    const lines = [
      `שם: ${name}`,
      `טלפון: ${phone}`,
      message ? `הודעה: ${message}` : '',
    ].filter(Boolean)
    return `${WA_BASE}?text=${encodeURIComponent(lines.join('\n'))}`
  }

  async function submit() {
    setError('')

    if (!name.trim() || name.trim().length < 2) {
      setError('נא להזין שם')
      return
    }
    if (!phone.trim()) {
      setError('נא להזין מספר טלפון')
      return
    }

    setSending(true)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, email, message, website }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok) {
        setSent(true)
      } else {
        setError(data.error || 'אירעה שגיאה. נסו שוב.')
      }
    } catch {
      setError('אירעה שגיאה ברשת. נסו שוב.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="mx-auto max-w-xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Link href="/" className="text-sm text-primary hover:underline">← חזרה לדף הבית</Link>
        </div>

        <h1 className="text-3xl font-bold text-foreground mb-2">צור קשר</h1>
        <p className="text-muted-foreground text-sm mb-8">
          מלאו את הפרטים ונחזור אליכם בהקדם. אפשר גם להמשיך ישירות בוואטסאפ.
        </p>

        {sent ? (
          <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-6 text-center">
            <p className="text-lg font-semibold text-foreground mb-1">הפנייה נשלחה!</p>
            <p className="text-sm text-muted-foreground mb-5">ניצור קשר בקרוב.</p>
            <a
              href={waFollowUpUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold text-white"
              style={{ background: '#25D366' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
                <path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.82 9.82 0 0 0 1.523 5.255l-.999 3.648 3.965-1.602zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
              </svg>
              המשך בוואטסאפ
            </a>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Honeypot — visually hidden, off-screen, not announced */}
            <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }}>
              <label htmlFor="website">אתר</label>
              <input
                id="website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="name" className="block text-sm font-medium text-foreground mb-1.5">
                שם <span className="text-red-500">*</span>
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                autoComplete="name"
              />
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-foreground mb-1.5">
                טלפון <span className="text-red-500">*</span>
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                autoComplete="tel"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">
                אימייל <span className="text-muted-foreground text-xs">(לא חובה)</span>
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="message" className="block text-sm font-medium text-foreground mb-1.5">
                הודעה
              </label>
              <textarea
                id="message"
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary resize-y"
              />
            </div>

            {error && (
              <p className="text-sm text-red-500" role="alert">{error}</p>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={sending}
              className="w-full rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {sending ? 'שולח…' : 'שליחה'}
            </button>

            <p className="text-center text-xs text-muted-foreground">
              מעדיפים וואטסאפ?{' '}
              <a
                href={WA_BASE}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                דברו איתנו עכשיו
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
