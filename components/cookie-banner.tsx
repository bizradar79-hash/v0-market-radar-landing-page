'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export function CookieBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const accepted = localStorage.getItem('cookies_accepted')
    if (!accepted) setVisible(true)
  }, [])

  const accept = () => {
    localStorage.setItem('cookies_accepted', '1')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-sm px-4 py-4"
      dir="rtl"
    >
      <div className="mx-auto max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground text-center sm:text-right">
          אנחנו משתמשים בעוגיות לצורך הפעלת השירות ושיפור חווית המשתמש.{' '}
          <Link href="/privacy" className="text-primary hover:underline">מדיניות פרטיות</Link>
        </p>
        <button
          onClick={accept}
          className="shrink-0 rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          הבנתי, אוקיי
        </button>
      </div>
    </div>
  )
}
