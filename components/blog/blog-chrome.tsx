// Header + footer for the public blog. Server components — no client JS, so
// the article pages stay fast and fully server-rendered for indexing.
//
// The landing's own header links to in-page anchors (#how, #pricing), which
// mean nothing on /blog, so these point back at the landing explicitly.

import Link from 'next/link'
import Image from 'next/image'

const BRAND = '#0D9488'

export function BlogHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-gray-100 bg-white" dir="rtl">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex h-full items-center" aria-label="North Star Radar — דף הבית">
          <Image src="/whitelogo.png" alt="North Star Radar" width={160} height={40} className="h-9 w-auto object-contain" unoptimized />
        </Link>
        <nav aria-label="ניווט ראשי" className="flex items-center gap-5 text-sm font-medium text-gray-600">
          <Link href="/" className="hidden transition-colors hover:text-gray-900 sm:inline">דף הבית</Link>
          <Link href="/blog" className="transition-colors hover:text-gray-900">בלוג</Link>
          <Link href="/#pricing" className="hidden transition-colors hover:text-gray-900 sm:inline">תמחור</Link>
          <Link
            href="/signup"
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: BRAND }}
          >
            הצטרף עכשיו
          </Link>
        </nav>
      </div>
    </header>
  )
}

export function BlogFooter() {
  return (
    <footer className="mt-20 border-t border-gray-100 bg-gray-50" dir="rtl">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-4 py-10 text-sm text-gray-500 sm:flex-row sm:justify-between sm:px-6">
        <p>© {new Date().getFullYear()} North Star Radar — מודיעין שוק לעסקים בישראל</p>
        <nav aria-label="ניווט תחתון" className="flex flex-wrap items-center justify-center gap-5">
          <Link href="/" className="transition-colors hover:text-gray-900">דף הבית</Link>
          <Link href="/blog" className="transition-colors hover:text-gray-900">בלוג</Link>
          <Link href="/terms" className="transition-colors hover:text-gray-900">תנאי שימוש</Link>
          <Link href="/privacy" className="transition-colors hover:text-gray-900">מדיניות פרטיות</Link>
          <Link href="/accessibility" className="transition-colors hover:text-gray-900">הצהרת נגישות</Link>
        </nav>
      </div>
    </footer>
  )
}

/** "Try it" block shown under every article — the blog's job is to convert. */
export function BlogCta() {
  return (
    <aside
      className="mt-14 rounded-2xl p-8 text-center"
      style={{ background: 'linear-gradient(160deg, #F0FDFA, #ffffff 70%)', border: `1px solid ${BRAND}33` }}
    >
      <p className="text-xl font-extrabold text-slate-900">רוצה לדעת מה המתחרים שלך עושים — כל שבוע?</p>
      <p className="mx-auto mt-2 max-w-md text-gray-600">
        North Star Radar מרכז לך בדוח אחד את המתחרים, הטרנדים והדירוג שלך בגוגל ובמנועי AI.
      </p>
      <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link href="/signup" className="rounded-xl px-7 py-3 font-bold text-white" style={{ backgroundColor: BRAND }}>
          התחל עכשיו ←
        </Link>
        <Link href="/r/demo" className="rounded-xl border-2 px-7 py-3 font-bold" style={{ borderColor: BRAND, color: BRAND }}>
          צפה בדוח לדוגמה
        </Link>
      </div>
    </aside>
  )
}
