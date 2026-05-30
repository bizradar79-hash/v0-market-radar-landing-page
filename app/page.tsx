"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"

// ── Scroll-aware header ───────────────────────────────────────────────────

function Header() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header
      className={`sticky top-0 z-50 w-full h-16 overflow-hidden bg-white transition-shadow duration-300 flex items-center ${scrolled ? "shadow-md" : "border-b border-gray-100"}`}
      dir="rtl"
    >
      <div className="mx-auto flex h-full w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center h-full">
          <Image src="/whitelogo.png" alt="North Star Radar" width={160} height={40} className="h-9 w-auto object-contain" unoptimized />
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium text-gray-600 sm:flex">
          <a href="#modules" className="hover:text-gray-900 transition-colors">מודולים</a>
          <a href="#how" className="hover:text-gray-900 transition-colors">איך זה עובד</a>
          <a href="#pricing" className="hover:text-gray-900 transition-colors">תמחור</a>
          <a href="#faq" className="hover:text-gray-900 transition-colors">שאלות</a>
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
            התחבר
          </Link>
          <Link
            href="/signup"
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 hover:scale-105"
            style={{ backgroundColor: "#0D9488" }}
          >
            הצטרף עכשיו
          </Link>
        </div>
      </div>
    </header>
  )
}

// ── Dashboard preview ─────────────────────────────────────────────────────

function DashboardPreview() {
  return (
    <div className="mt-14 mx-auto w-full max-w-3xl rounded-2xl p-6 shadow-2xl" style={{ background: "#0F172A" }}>
      <div className="mb-4 flex items-center gap-2">
        <div className="h-3 w-3 rounded-full bg-red-400" />
        <div className="h-3 w-3 rounded-full bg-yellow-400" />
        <div className="h-3 w-3 rounded-full bg-green-400" />
        <span className="mr-2 text-xs text-gray-500">North Star Radar — Dashboard</span>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: "הזדמנויות חדשות", value: "5", color: "#0D9488" },
          { label: "פוטנציאל הכנסה", value: "₪42K", color: "#6366F1" },
          { label: "פעולות השבוע", value: "3", color: "#F59E0B" },
        ].map((m) => (
          <div key={m.label} className="rounded-lg p-3" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div className="text-xs text-gray-400 mb-1">{m.label}</div>
            <div className="text-xl font-bold" style={{ color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {[
          { type: "📈 טרנד", title: "עלייה בביקוש לשירותי AI בתחום הרפואה", score: 92 },
          { type: "📋 מכרז", title: "מכרז עירייה לשירותי ייעוץ — ₪120,000", score: 88 },
          { type: "🤝 ליד", title: "חברת טכנולוגיה מחפשת שותף שיווקי", score: 81 },
        ].map((s) => (
          <div
            key={s.title}
            className="flex items-center justify-between rounded-lg px-3 py-2.5"
            style={{ background: "rgba(255,255,255,0.05)" }}
          >
            <span className="text-xs text-gray-300 truncate flex-1">{s.type} · {s.title}</span>
            <span
              className="mr-3 shrink-0 rounded-full px-2 py-0.5 text-xs font-bold"
              style={{ background: "rgba(13,148,136,0.2)", color: "#0D9488" }}
            >
              {s.score}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Module groups ─────────────────────────────────────────────────────────

const moduleGroups = [
  {
    icon: "🚀",
    title: "מנוע צמיחה",
    color: "#0D9488",
    modules: ["דשבורד", "פרופיל עסקי", "ערוצי הפצה", "מרכז הזדמנויות"],
  },
  {
    icon: "📊",
    title: "מודיעין שוק",
    color: "#6366F1",
    modules: ["ניתוח מתחרים", "טרנדים", "דירוג SEO/GEO"],
  },
  {
    icon: "🤝",
    title: "פיתוח עסקי",
    color: "#F59E0B",
    modules: ["מכרזים", "כנסים", "חדשות ועדכונים"],
  },
  {
    icon: "⚙️",
    title: "ניהול מערכת",
    color: "#EC4899",
    modules: ["פריטים שמורים", "דוחות", "הגדרות"],
  },
]

// ── FAQ ────────────────────────────────────────────────────────────────────

const faqs = [
  { q: "למי מתאים North Star Radar?", a: "לכל עסק קטן או בינוני שרוצה לצמוח: יועצים, קבלנים, רופאים, שיווק, טכנולוגיה ועוד." },
  { q: "כמה זמן עד לתוצאות?", a: "רוב המשתמשים מוצאים הזדמנות ראשונה תוך 48 שעות מהרשמה." },
  { q: "האם צריך ידע טכנולוגי?", a: "בכלל לא. הממשק פשוט ובעברית מלאה." },
  { q: "מה ההבדל מחיפוש ב-Google?", a: "Google מחזיר מידע כללי. הרדאר מנתח את השוק הספציפי שלך ומייצר פעולות מותאמות אישית." },
  { q: "האם המידע מתעדכן?", a: "כן, הרדאר סורק את השוק כל שבוע ומעדכן אוטומטית." },
  { q: "מה כולל המנוי?", a: "כל המודולים: מנוע צמיחה, מודיעין שוק, פיתוח עסקי וניהול מערכת — הכל ב-79 ₪ בחודש." },
]

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-gray-200 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-4 text-right text-sm font-semibold text-gray-900 hover:text-teal-600 transition-colors"
      >
        <span>{q}</span>
        <span className="mr-4 shrink-0 text-lg leading-none">{open ? "−" : "+"}</span>
      </button>
      {open && <p className="pb-4 text-sm text-gray-600 leading-relaxed">{a}</p>}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div dir="rtl" className="min-h-screen bg-white text-gray-900">
      <Header />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pt-16 pb-4 sm:px-6 text-center">
        <div
          className="mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium"
          style={{ borderColor: "#0D9488", color: "#0D9488", background: "#F0FDFA" }}
        >
          🚀 מודיעין עסקי מבוסס AI לשוק הישראלי
        </div>

        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl" style={{ color: "#0F172A" }}>
          הרדאר העסקי שמכוון אותך<br />
          <span style={{ color: "#0D9488" }}>להזדמנויות הנכונות</span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-500 leading-relaxed">
          North Star Radar סורק את השוק הישראלי ומציג לך מכרזים, טרנדים, מתחרים ולידים — כל שבוע, מותאם לעסק שלך.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/signup"
            className="rounded-xl px-8 py-3.5 text-base font-bold text-white shadow-lg transition-all hover:scale-105 hover:opacity-95"
            style={{ backgroundColor: "#0D9488" }}
          >
            הצטרף עכשיו — 79 ₪/חודש ←
          </Link>
          <a
            href="#modules"
            className="rounded-xl border-2 px-8 py-3.5 text-base font-bold transition-all hover:scale-105 hover:bg-gray-50"
            style={{ borderColor: "#0F172A", color: "#0F172A" }}
          >
            גלה את המודולים
          </a>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-gray-500">
          {["מותאם לשוק הישראלי", "ממשק בעברית מלאה", "כל הפיצ'רים כלולים"].map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <span style={{ color: "#0D9488" }}>✓</span> {t}
            </span>
          ))}
        </div>

        <DashboardPreview />
      </section>

      {/* ── Stats strip ──────────────────────────────────────────────────── */}
      <section className="mt-16 w-full py-10" style={{ backgroundColor: "#0D9488" }}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6 text-center">
          <p className="mb-6 text-lg font-semibold text-white">הרדאר העסקי שמכוון אותך להזדמנויות הנכונות</p>
          <div className="flex flex-wrap justify-center gap-8 sm:gap-16">
            {[
              { value: "2–5", label: "הזדמנויות בחודש" },
              { value: "₪15K–₪100K", label: "פוטנציאל" },
              { value: "40+ שעות", label: "חיסכון במחקר" },
              { value: "79 ₪", label: "בחודש הכל כלול" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-2xl font-extrabold text-white">{s.value}</div>
                <div className="text-sm text-teal-100">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Module groups ────────────────────────────────────────────────── */}
      <section id="modules" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="mb-4 text-center text-3xl font-extrabold" style={{ color: "#0F172A" }}>
          ארבעה מנועים. תמונה שלמה.
        </h2>
        <p className="mb-14 text-center text-gray-500 max-w-xl mx-auto">
          כל המודולים כלולים במנוי אחד. לא צריך לבחור — מקבלים הכל.
        </p>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {moduleGroups.map((g) => (
            <div
              key={g.title}
              className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all duration-200 hover:shadow-lg hover:-translate-y-1"
              style={{ borderTop: `4px solid ${g.color}` }}
            >
              <div className="mb-3 text-3xl">{g.icon}</div>
              <h3 className="mb-4 text-base font-bold" style={{ color: "#0F172A" }}>{g.title}</h3>
              <ul className="space-y-2">
                {g.modules.map((m) => (
                  <li key={m} className="flex items-center gap-2 text-sm text-gray-600">
                    <span style={{ color: g.color }}>✓</span> {m}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features highlight ───────────────────────────────────────────── */}
      <section className="bg-gray-50 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="mb-16 text-center text-3xl font-extrabold" style={{ color: "#0F172A" }}>
            מה תקבל כל שבוע
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: "📋", title: "מכרזים ממשלתיים ועירוניים", desc: "סריקה שוטפת של מכרזים רלוונטיים לתחום שלך, כולל תקציב ותאריך הגשה." },
              { icon: "📈", title: "טרנדים חמים בשוק", desc: "זיהוי כיוונים צומחים בשוק הישראלי לפני שהם הופכים לרווים." },
              { icon: "🔍", title: "ניתוח מתחרים", desc: "מה המתחרים שלך עושים, איפה הם חלשים ואיפה אתה יכול להיות טוב יותר." },
              { icon: "🤝", title: "לידים לשיתופי פעולה", desc: "עסקים ישראליים שמחפשים שותפים בדיוק בתחום שלך." },
              { icon: "🎯", title: "פעולות לשבוע", desc: "AI מייצר רשימת פעולות מדויקת — לא הנחיות כלליות, פעולות ספציפיות לעסק." },
              { icon: "⭐", title: "מרכז הזדמנויות", desc: "Pipeline עסקי שמנהל ועוקב אחרי כל הזדמנות שמצאת, מהתחלה ועד סגירה." },
            ].map((b) => (
              <div
                key={b.title}
                className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all duration-200 hover:shadow-lg hover:-translate-y-1 hover:border-teal-200"
              >
                <div className="mb-3 text-3xl">{b.icon}</div>
                <h3 className="mb-2 text-base font-bold" style={{ color: "#0F172A" }}>{b.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section id="how" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="mb-16 text-center text-3xl font-extrabold" style={{ color: "#0F172A" }}>
          איך זה עובד?
        </h2>
        <div className="flex flex-col gap-12 lg:flex-row">
          {[
            { num: "1", icon: "🏢", title: "מוסיפים את העסק", desc: "מזינים שם העסק, תחום ועיר. פחות מ-2 דקות." },
            { num: "2", icon: "🤖", title: "AI סורק את השוק", desc: "הרדאר סורק מתחרים, טרנדים, מכרזים ולידים בזמן אמת." },
            { num: "3", icon: "🎯", title: "מקבלים הזדמנויות לפעולה", desc: "רשימה ברורה: מה לעשות השבוע כדי לצמוח ולהרוויח יותר." },
          ].map((step, i) => (
            <div key={step.num} className="relative flex flex-1 flex-col items-center text-center">
              <div
                className="mb-4 flex h-14 w-14 items-center justify-center rounded-full text-xl font-extrabold text-white shadow-lg"
                style={{ backgroundColor: "#0D9488" }}
              >
                {step.num}
              </div>
              <div className="mb-3 text-4xl">{step.icon}</div>
              <h3 className="mb-2 text-lg font-bold" style={{ color: "#0F172A" }}>{step.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed max-w-xs">{step.desc}</p>
              {i < 2 && (
                <div className="absolute left-0 top-7 hidden w-8 text-2xl text-gray-300 lg:block" style={{ left: "-1rem" }}>
                  ←
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── ROI ──────────────────────────────────────────────────────────── */}
      <section className="py-20" style={{ backgroundColor: "#0F172A" }}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6 text-center">
          <h2 className="mb-12 text-3xl font-extrabold text-white">כמה שווה לעסק שלך?</h2>
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              { value: "2–5", label: "הזדמנויות חדשות בחודש" },
              { value: "₪15,000–₪100,000", label: "פוטנציאל הכנסה נוסף" },
              { value: "40+", label: "שעות מחקר שנחסכות" },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl p-8" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div className="mb-2 text-4xl font-extrabold" style={{ color: "#0D9488" }}>{s.value}</div>
                <div className="text-sm text-gray-400">{s.label}</div>
              </div>
            ))}
          </div>
          <p className="mt-8 text-sm text-gray-500">הכל מבוסס על נתוני שוק אמיתיים ולא הערכות גנריות</p>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────────── */}
      <section id="pricing" className="bg-gray-50 py-20">
        <div className="mx-auto max-w-xl px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-extrabold" style={{ color: "#0F172A" }}>תמחור פשוט. הכל כלול.</h2>
            <p className="mt-3 text-gray-500">מסלול אחד. כל המודולים. ללא הפתעות.</p>
          </div>

          <div
            className="relative rounded-2xl bg-white p-10 shadow-xl"
            style={{ border: "2px solid #0D9488" }}
          >
            <div
              className="absolute -top-3 right-8 rounded-full px-4 py-1 text-xs font-bold text-white"
              style={{ backgroundColor: "#0D9488" }}
            >
              כל הפיצ'רים כלולים
            </div>

            <div className="text-center mb-8">
              <div className="text-5xl font-extrabold" style={{ color: "#0F172A" }}>
                79 <span className="text-2xl">₪</span>
              </div>
              <div className="text-gray-500 mt-1">לחודש</div>
            </div>

            <ul className="space-y-3 mb-8">
              {[
                "🚀 מנוע צמיחה מלא (דשבורד, פרופיל, ערוצי הפצה, מרכז הזדמנויות)",
                "📊 מודיעין שוק (מתחרים, טרנדים, דירוג SEO/GEO)",
                "🤝 פיתוח עסקי (מכרזים, כנסים, חדשות)",
                "⚙️ ניהול מערכת (פריטים שמורים, דוחות, הגדרות)",
                "עדכון שבועי אוטומטי",
                "ממשק בעברית מלאה",
                "תמיכה בעברית",
              ].map((feat) => (
                <li key={feat} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="mt-0.5 shrink-0" style={{ color: "#0D9488" }}>✓</span>
                  <span>{feat}</span>
                </li>
              ))}
            </ul>

            <Link
              href="/signup"
              className="block w-full rounded-xl py-4 text-center text-base font-bold text-white transition-all hover:opacity-90 hover:scale-105"
              style={{ backgroundColor: "#0D9488" }}
            >
              הצטרף עכשיו ←
            </Link>
            <p className="mt-4 text-center text-xs text-gray-400">ביטול בכל רגע · תשלום מאובטח</p>
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="py-20">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 text-center">
          <div className="rounded-3xl p-12 shadow-xl" style={{ background: "linear-gradient(135deg, #0D9488 0%, #0891B2 100%)" }}>
            <h2 className="mb-4 text-3xl font-extrabold text-white">מוכן לנווט בשוק חכם יותר?</h2>
            <p className="mb-8 text-teal-100">הצטרף ותראה הזדמנויות עסקיות אמיתיות תוך 48 שעות.</p>
            <Link
              href="/signup"
              className="inline-block rounded-xl bg-white px-8 py-4 text-base font-extrabold transition-all hover:scale-105 hover:shadow-lg"
              style={{ color: "#0D9488" }}
            >
              הצטרף עכשיו — 79 ₪/חודש ←
            </Link>
            <p className="mt-6 text-sm text-teal-100">ביטול בכל רגע · אין התחייבות · תמיכה בעברית</p>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section id="faq" className="mx-auto max-w-2xl px-4 py-20 sm:px-6">
        <h2 className="mb-10 text-center text-3xl font-extrabold" style={{ color: "#0F172A" }}>שאלות נפוצות</h2>
        <div className="divide-y divide-gray-200 rounded-2xl border border-gray-100 bg-white px-6 shadow-sm">
          {faqs.map((f) => <FaqItem key={f.q} q={f.q} a={f.a} />)}
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <section className="py-24" style={{ backgroundColor: "#0F172A" }}>
        <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
          <h2 className="mb-5 text-4xl font-extrabold text-white leading-tight">
            התחל לנווט את העסק שלך עם North Star Radar
          </h2>
          <p className="mb-8 text-lg text-gray-400">הצטרף לעסקים שכבר מוצאים הזדמנויות חדשות כל שבוע</p>
          <Link
            href="/signup"
            className="inline-block rounded-xl px-10 py-4 text-lg font-extrabold text-white shadow-lg transition-all hover:scale-105 hover:opacity-90"
            style={{ backgroundColor: "#0D9488" }}
          >
            הצטרף עכשיו ←
          </Link>
          <p className="mt-6 text-sm text-gray-500">
            ✓ 79 ₪ לחודש &nbsp;·&nbsp; ✓ ביטול בכל רגע &nbsp;·&nbsp; ✓ כל הפיצ'רים כלולים
          </p>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 bg-white py-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
            <div>
              <Image src="/whitelogo.png" alt="North Star Radar" width={200} height={56} className="h-12 w-auto object-contain mb-1" unoptimized />
              <p className="text-xs text-gray-400">הרדאר העסקי שמכוון אותך להזדמנויות הנכונות</p>
            </div>
            <nav className="flex flex-wrap justify-center gap-5 text-sm text-gray-500">
              <a href="#modules" className="hover:text-gray-900 transition-colors">מודולים</a>
              <a href="#pricing" className="hover:text-gray-900 transition-colors">תמחור</a>
              <a href="mailto:support@nsradar.co.il" className="hover:text-gray-900 transition-colors">צור קשר</a>
              <Link href="/terms" className="hover:text-gray-900 transition-colors">תנאי שימוש</Link>
              <Link href="/privacy" className="hover:text-gray-900 transition-colors">מדיניות פרטיות</Link>
            </nav>
          </div>
          <p className="mt-8 text-center text-xs text-gray-400">© 2026 North Star Radar. כל הזכויות שמורות.</p>
        </div>
      </footer>
    </div>
  )
}
