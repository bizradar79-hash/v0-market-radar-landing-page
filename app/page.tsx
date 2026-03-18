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
      className={`sticky top-0 z-50 w-full bg-white transition-shadow duration-300 ${scrolled ? "shadow-md" : "border-b border-gray-100"}`}
      dir="rtl"
    >
      <div className="mx-auto flex min-h-[80px] max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center">
          <Image src="/northlogo.png" alt="North Star Radar" width={220} height={220} className="h-20 w-auto object-contain" style={{ maxHeight: '80px', width: 'auto' }} unoptimized />
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium text-gray-600 sm:flex">
          <a href="#features" className="hover:text-gray-900 transition-colors">מוצר</a>
          <a href="#pricing" className="hover:text-gray-900 transition-colors">תמחור</a>
          <a href="#faq" className="hover:text-gray-900 transition-colors">שאלות</a>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="hidden text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors sm:block"
          >
            התחבר
          </Link>
          <Link
            href="/login"
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 hover:scale-105"
            style={{ backgroundColor: "#0D9488" }}
          >
            התחל חינם
          </Link>
        </div>
      </div>
    </header>
  )
}

// ── Mock dashboard preview ────────────────────────────────────────────────

function DashboardPreview() {
  return (
    <div
      className="mt-12 mx-auto w-full max-w-3xl rounded-2xl p-6 shadow-2xl"
      style={{ background: "#0F172A" }}
    >
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

// ── Data ──────────────────────────────────────────────────────────────────

const benefits = [
  { icon: "💰", title: "הזדמנויות להכנסה", desc: "AI מזהה הזדמנויות רווחיות ספציפיות לעסק שלך" },
  { icon: "🔍", title: "נישות חדשות", desc: "גילוי תחומי צמיחה לפני שהשוק נהיה צפוף" },
  { icon: "⚡", title: "פעולות לשבוע", desc: "רשימת פעולות ברורה ומיידית לביצוע" },
  { icon: "🤝", title: "לידים לשיתופי פעולה", desc: "איתור שותפים עסקיים פוטנציאליים" },
  { icon: "📊", title: "טרנדים ומודיעין שוק", desc: "הבנת כיוון השוק והמתחרים" },
  { icon: "🏆", title: "מרכז הזדמנויות", desc: "מעקב וניהול כל ההזדמנויות במקום אחד" },
]

const features = [
  {
    icon: "⚡",
    title: "מה לעשות השבוע",
    desc: "AI מייצר פעולות עסקיות אמיתיות ומיידיות — ללא ניחושים, רק החלטות מבוססות נתונים.",
    mock: (
      <div className="space-y-2 rounded-xl p-4" style={{ background: "#0F172A" }}>
        {[
          { label: "📋 מכרז", title: "הגש הצעה לעירייה", badge: "דחוף", badgeColor: "#EF4444" },
          { label: "🤝 ליד", title: "פנה לחברת הטכנולוגיה", badge: "גבוהה", badgeColor: "#F59E0B" },
          { label: "📈 טרנד", title: "כנס לנישת AI רפואה", badge: "חדש", badgeColor: "#0D9488" },
        ].map((a) => (
          <div key={a.title} className="flex items-center gap-3 rounded-lg p-3" style={{ background: "rgba(255,255,255,0.06)" }}>
            <span className="text-sm">{a.label}</span>
            <span className="flex-1 text-xs text-gray-300">{a.title}</span>
            <span className="rounded-full px-2 py-0.5 text-xs font-bold text-white" style={{ background: a.badgeColor }}>{a.badge}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: "🔎",
    title: "מצא נישה חדשה",
    desc: "גילוי תחומים רווחיים לפני שהשוק נהיה צפוף. AI מנתח סיגנלים אמיתיים מהשוק הישראלי.",
    mock: (
      <div className="space-y-2 rounded-xl p-4" style={{ background: "#0F172A" }}>
        {[
          { title: "AI לקליניקות רפואה", score: 94 },
          { title: "ייעוץ ESG לחברות", score: 87 },
          { title: "אוטומציה לרואי חשבון", score: 82 },
        ].map((n) => (
          <div key={n.title} className="flex items-center justify-between rounded-lg px-3 py-2.5" style={{ background: "rgba(255,255,255,0.06)" }}>
            <span className="text-xs text-gray-300">{n.title}</span>
            <div className="flex items-center gap-2 mr-3">
              <div className="h-1.5 w-20 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
                <div className="h-full rounded-full" style={{ width: `${n.score}%`, background: "#0D9488" }} />
              </div>
              <span className="text-xs font-bold" style={{ color: "#0D9488" }}>{n.score}</span>
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: "⭐",
    title: "מרכז הזדמנויות",
    desc: "שמירה ומעקב אחרי הזדמנויות שנבחרו — Pipeline עסקי מנוהל ב-AI.",
    mock: (
      <div className="rounded-xl p-4" style={{ background: "#0F172A" }}>
        {[
          { title: "מכרז ייעוץ עסקי", status: "בפעולה", color: "#10B981" },
          { title: "שיתוף פעולה — SaaS", status: "בבדיקה", color: "#F59E0B" },
          { title: "נישת AI בריאות", status: "חדש", color: "#6366F1" },
        ].map((o) => (
          <div key={o.title} className="flex items-center justify-between border-b py-2.5 last:border-0" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
            <span className="text-xs text-gray-300">{o.title}</span>
            <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: `${o.color}22`, color: o.color }}>{o.status}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: "🤝",
    title: "המלצות לשיתופי פעולה",
    desc: "איתור לידים עסקיים פוטנציאליים רלוונטיים לתחום שלך.",
    mock: (
      <div className="space-y-2 rounded-xl p-4" style={{ background: "#0F172A" }}>
        {[
          { name: "TechVentures Ltd", match: "98%", industry: "טכנולוגיה" },
          { name: "MedConsult", match: "91%", industry: "רפואה" },
          { name: "GreenBuild", match: "85%", industry: "בנייה" },
        ].map((l) => (
          <div key={l.name} className="flex items-center gap-3 rounded-lg p-3" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(13,148,136,0.2)" }}>
              <span className="text-xs font-bold" style={{ color: "#0D9488" }}>{l.name[0]}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{l.name}</p>
              <p className="text-xs text-gray-500">{l.industry}</p>
            </div>
            <span className="text-xs font-bold" style={{ color: "#0D9488" }}>{l.match}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: "📊",
    title: "מודיעין שוק וטרנדים",
    desc: "ניתוח מתחרים, טרנדים וחדשות — הכל במקום אחד.",
    mock: (
      <div className="rounded-xl p-4" style={{ background: "#0F172A" }}>
        <div className="mb-3 text-xs text-gray-400">טרנדים עולים בשוק</div>
        {[65, 80, 55, 90, 72].map((h, i) => (
          <div key={i} className="mb-2 flex items-center gap-3">
            <span className="w-20 truncate text-xs text-gray-400">טרנד {i + 1}</span>
            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${h}%`, background: "linear-gradient(90deg, #0D9488, #6366F1)" }}
              />
            </div>
            <span className="text-xs text-gray-500">{h}%</span>
          </div>
        ))}
      </div>
    ),
  },
]

const faqs = [
  { q: "למי מתאים North Star Radar?", a: "לכל עסק קטן או בינוני שרוצה לצמוח: יועצים, קבלנים, רופאים, שיווק, טכנולוגיה ועוד." },
  { q: "כמה זמן עד לתוצאות?", a: "רוב המשתמשים מוצאים הזדמנות ראשונה תוך 48 שעות מהרשמה." },
  { q: "האם צריך ידע טכנולוגי?", a: "בכלל לא. הממשק פשוט ובעברית מלאה." },
  { q: "מה ההבדל מחיפוש ב-Google?", a: "Google מחזיר מידע כללי. הרדאר מנתח את השוק הספציפי שלך ומייצר פעולות מותאמות אישית." },
  { q: "האם המידע מתעדכן?", a: "כן, הרדאר סורק את השוק כל שבוע ומעדכן אוטומטית." },
]

// ── FAQ accordion ─────────────────────────────────────────────────────────

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

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pt-16 pb-4 sm:px-6 text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-4 py-1.5 text-sm font-medium" style={{ color: "#0D9488" }}>
          🚀 AI לעסקים קטנים ובינוניים
        </div>

        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl" style={{ color: "#0F172A" }}>
          מצא הזדמנויות עסקיות חדשות לפני המתחרים
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-500 leading-relaxed">
          North Star Radar הוא הרדאר העסקי שלך. מערכת AI שסורקת את השוק ומראה לך בדיוק מה לעשות השבוע, איפה להרוויח יותר ואיזה נישות לפתוח.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/login"
            className="rounded-xl px-8 py-3.5 text-base font-bold text-white shadow-lg transition-all hover:scale-105 hover:opacity-95"
            style={{ backgroundColor: "#0D9488" }}
          >
            התחל ניסיון חינם ←
          </Link>
          <a
            href="#features"
            className="rounded-xl border-2 px-8 py-3.5 text-base font-bold transition-all hover:scale-105 hover:bg-gray-50"
            style={{ borderColor: "#0F172A", color: "#0F172A" }}
          >
            צפה בדמו
          </a>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-gray-500">
          {["מותאם לעסקים קטנים ובינוניים", "אין צורך בידע טכנולוגי", "תוצאות תוך ימים"].map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <span style={{ color: "#0D9488" }}>✓</span> {t}
            </span>
          ))}
        </div>

        <DashboardPreview />
      </section>

      {/* ── Brand strip ────────────────────────────────────────────────── */}
      <section className="mt-16 w-full py-10" style={{ backgroundColor: "#0D9488" }}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6 text-center">
          <p className="mb-6 text-lg font-semibold text-white">הרדאר העסקי שמכוון אותך להזדמנויות הנכונות</p>
          <div className="flex flex-wrap justify-center gap-8 sm:gap-16">
            {[
              { value: "2–5", label: "הזדמנויות בחודש" },
              { value: "₪15K–₪100K", label: "פוטנציאל" },
              { value: "עשרות שעות", label: "חיסכון" },
              { value: "7 ימים", label: "ניסיון חינם" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-2xl font-extrabold text-white">{s.value}</div>
                <div className="text-sm text-teal-100">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Benefits ───────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="mb-12 text-center text-3xl font-extrabold" style={{ color: "#0F172A" }}>
          מה תקבל מ-North Star Radar
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map((b) => (
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
      </section>

      {/* ── Features (alternating) ─────────────────────────────────────── */}
      <section id="features" className="bg-gray-50 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="mb-16 text-center text-3xl font-extrabold" style={{ color: "#0F172A" }}>
            הפיצ'רים שישנו את העסק שלך
          </h2>
          <div className="space-y-20">
            {features.map((f, i) => (
              <div
                key={f.title}
                className={`flex flex-col gap-10 lg:flex-row lg:items-center ${i % 2 === 1 ? "lg:flex-row-reverse" : ""}`}
              >
                <div className="flex-1">
                  <div className="mb-4 text-4xl">{f.icon}</div>
                  <h3 className="mb-4 text-2xl font-extrabold" style={{ color: "#0F172A" }}>{f.title}</h3>
                  <p className="text-gray-500 leading-relaxed">{f.desc}</p>
                </div>
                <div className="flex-1">{f.mock}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="mb-16 text-center text-3xl font-extrabold" style={{ color: "#0F172A" }}>
          איך זה עובד?
        </h2>
        <div className="flex flex-col gap-8 lg:flex-row">
          {[
            { num: "1", icon: "🏢", title: "מוסיפים את העסק", desc: "מזינים פרטי העסק, תחום, ועיר. 2 דקות בלבד." },
            { num: "2", icon: "🤖", title: "AI סורק את השוק", desc: "הרדאר סורק מתחרים, טרנדים, מכרזים ולידים בזמן אמת." },
            { num: "3", icon: "🎯", title: "מקבלים הזדמנויות לפעולה", desc: "רשימת פעולות ברורה מה לעשות השבוע כדי לצמוח." },
          ].map((step, i) => (
            <div key={step.num} className="flex flex-1 flex-col items-center text-center">
              <div
                className="mb-4 flex h-12 w-12 items-center justify-center rounded-full text-lg font-extrabold text-white shadow-lg"
                style={{ backgroundColor: "#0D9488" }}
              >
                {step.num}
              </div>
              <div className="mb-3 text-3xl">{step.icon}</div>
              <h3 className="mb-2 text-lg font-bold" style={{ color: "#0F172A" }}>{step.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed max-w-xs">{step.desc}</p>
              {i < 2 && <div className="hidden lg:block mt-6 text-2xl text-gray-300">←</div>}
            </div>
          ))}
        </div>
      </section>

      {/* ── ROI ────────────────────────────────────────────────────────── */}
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

      {/* ── Live feed demo ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-extrabold" style={{ color: "#0F172A" }}>הזדמנויות שהרדאר זיהה עכשיו</h2>
          <p className="mt-3 text-gray-500">דוגמאות אמיתיות לסוג המידע שתקבל</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { badge: "📈 טרנד חדש", badgeBg: "#EFF6FF", badgeColor: "#3B82F6", title: "עלייה בביקוש לשירותי AI בתחום הרפואה", time: "זוהה לפני 3 שעות" },
            { badge: "📋 מכרז חדש", badgeBg: "#FFF7ED", badgeColor: "#F59E0B", title: "מכרז עירייה לשירותי ייעוץ עסקי — תקציב ₪120,000", time: "זוהה לפני 5 שעות" },
            { badge: "🤝 שיתוף פעולה", badgeBg: "#F0FDF4", badgeColor: "#10B981", title: "חברת טכנולוגיה מחפשת שותף בתחום השיווק", time: "זוהה לפני 8 שעות" },
          ].map((card) => (
            <div
              key={card.title}
              className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-1"
              style={{ borderRight: "4px solid #0D9488" }}
            >
              <span
                className="mb-3 inline-block rounded-full px-3 py-1 text-xs font-semibold"
                style={{ background: card.badgeBg, color: card.badgeColor }}
              >
                {card.badge}
              </span>
              <p className="mb-3 text-sm font-semibold leading-snug" style={{ color: "#0F172A" }}>{card.title}</p>
              <p className="text-xs text-gray-400">{card.time}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ────────────────────────────────────────────────────── */}
      <section id="pricing" className="bg-gray-50 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-extrabold" style={{ color: "#0F172A" }}>תמחור פשוט וברור</h2>
            <p className="mt-3 text-gray-500">7 ימים ניסיון חינם בכל תוכנית. ביטול בכל רגע.</p>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Starter */}
            <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm transition-all hover:shadow-md">
              <h3 className="text-lg font-bold" style={{ color: "#0F172A" }}>Starter</h3>
              <div className="mt-2 mb-6">
                <span className="text-4xl font-extrabold" style={{ color: "#0F172A" }}>₪149</span>
                <span className="text-gray-500">/חודש</span>
              </div>
              <ul className="space-y-3 mb-8">
                {["מודיעין שוק בסיסי", "עד 3 מתחרים", "טרנדים שבועיים"].map((feat) => (
                  <li key={feat} className="flex items-center gap-2 text-sm text-gray-600">
                    <span style={{ color: "#0D9488" }}>✓</span> {feat}
                  </li>
                ))}
              </ul>
              <Link href="/login" className="block w-full rounded-xl border-2 py-3 text-center text-sm font-bold transition-all hover:bg-gray-50" style={{ borderColor: "#0F172A", color: "#0F172A" }}>
                התחל חינם
              </Link>
            </div>

            {/* Growth */}
            <div className="relative rounded-2xl bg-white p-8 shadow-xl transition-all hover:shadow-2xl hover:-translate-y-1" style={{ border: "2px solid #0D9488" }}>
              <div className="absolute -top-3 right-6 rounded-full px-4 py-1 text-xs font-bold text-white" style={{ backgroundColor: "#0D9488" }}>
                הכי פופולרי
              </div>
              <h3 className="text-lg font-bold" style={{ color: "#0F172A" }}>Growth</h3>
              <div className="mt-2 mb-6">
                <span className="text-4xl font-extrabold" style={{ color: "#0D9488" }}>₪299</span>
                <span className="text-gray-500">/חודש</span>
              </div>
              <ul className="space-y-3 mb-8">
                {["כל מה ש-Starter כולל", "מה לעשות השבוע", "מצא נישה חדשה", "מרכז הזדמנויות", "ניתוח שוק"].map((feat) => (
                  <li key={feat} className="flex items-center gap-2 text-sm text-gray-600">
                    <span style={{ color: "#0D9488" }}>✓</span> {feat}
                  </li>
                ))}
              </ul>
              <Link href="/login" className="block w-full rounded-xl py-3 text-center text-sm font-bold text-white transition-all hover:opacity-90 hover:scale-105" style={{ backgroundColor: "#0D9488" }}>
                התחל חינם
              </Link>
            </div>

            {/* Pro */}
            <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm transition-all hover:shadow-md">
              <h3 className="text-lg font-bold" style={{ color: "#0F172A" }}>Pro</h3>
              <div className="mt-2 mb-6">
                <span className="text-4xl font-extrabold" style={{ color: "#0F172A" }}>₪599</span>
                <span className="text-gray-500">/חודש</span>
              </div>
              <ul className="space-y-3 mb-8">
                {["כל מה ש-Growth כולל", "API גישה", "דוחות מתקדמים", "תמיכה עדיפותית"].map((feat) => (
                  <li key={feat} className="flex items-center gap-2 text-sm text-gray-600">
                    <span style={{ color: "#0D9488" }}>✓</span> {feat}
                  </li>
                ))}
              </ul>
              <Link href="/login" className="block w-full rounded-xl border-2 py-3 text-center text-sm font-bold transition-all hover:bg-gray-50" style={{ borderColor: "#0F172A", color: "#0F172A" }}>
                התחל חינם
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Free trial CTA ─────────────────────────────────────────────── */}
      <section className="py-20">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 text-center">
          <div className="rounded-3xl p-12 shadow-xl" style={{ background: "linear-gradient(135deg, #0D9488 0%, #0891B2 100%)" }}>
            <h2 className="mb-4 text-3xl font-extrabold text-white">7 ימים חינם. ללא כרטיס אשראי.</h2>
            <p className="mb-8 text-teal-100">התחל היום ותראה הזדמנויות עסקיות אמיתיות תוך 48 שעות.</p>
            <Link
              href="/login"
              className="inline-block rounded-xl bg-white px-8 py-4 text-base font-extrabold transition-all hover:scale-105 hover:shadow-lg"
              style={{ color: "#0D9488" }}
            >
              התחל ניסיון חינם עכשיו ←
            </Link>
            <p className="mt-6 text-sm text-teal-100">ביטול בכל רגע · אין התחייבות · תמיכה בעברית</p>
          </div>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────── */}
      <section id="faq" className="mx-auto max-w-2xl px-4 py-20 sm:px-6">
        <h2 className="mb-10 text-center text-3xl font-extrabold" style={{ color: "#0F172A" }}>שאלות נפוצות</h2>
        <div className="divide-y divide-gray-200 rounded-2xl border border-gray-100 bg-white px-6 shadow-sm">
          {faqs.map((f) => <FaqItem key={f.q} q={f.q} a={f.a} />)}
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────────── */}
      <section className="py-24" style={{ backgroundColor: "#0F172A" }}>
        <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
          <h2 className="mb-5 text-4xl font-extrabold text-white leading-tight">
            התחל לנווט את העסק שלך עם North Star Radar
          </h2>
          <p className="mb-8 text-lg text-gray-400">הצטרף לעסקים שכבר מוצאים הזדמנויות חדשות כל שבוע</p>
          <Link
            href="/login"
            className="inline-block rounded-xl px-10 py-4 text-lg font-extrabold text-white shadow-lg transition-all hover:scale-105 hover:opacity-90"
            style={{ backgroundColor: "#0D9488" }}
          >
            התחל ניסיון חינם ←
          </Link>
          <p className="mt-6 text-sm text-gray-500">
            ✓ 7 ימים חינם &nbsp;·&nbsp; ✓ ביטול בכל רגע &nbsp;·&nbsp; ✓ ללא כרטיס אשראי
          </p>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 bg-white py-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
            <div>
              <Image src="/northlogo.png" alt="North Star Radar" width={140} height={42} className="h-8 w-auto object-contain mb-1" style={{ maxHeight: '32px', width: 'auto' }} unoptimized />
              <p className="text-xs text-gray-400">הרדאר העסקי שמכוון אותך קדימה</p>
            </div>
            <nav className="flex flex-wrap justify-center gap-5 text-sm text-gray-500">
              <a href="#features" className="hover:text-gray-900 transition-colors">מוצר</a>
              <a href="#pricing" className="hover:text-gray-900 transition-colors">תמחור</a>
              <Link href="/login" className="hover:text-gray-900 transition-colors">צור קשר</Link>
              <Link href="/login" className="hover:text-gray-900 transition-colors">פרטיות</Link>
            </nav>
          </div>
          <p className="mt-8 text-center text-xs text-gray-400">© 2026 North Star Radar. כל הזכויות שמורות.</p>
        </div>
      </footer>
    </div>
  )
}
