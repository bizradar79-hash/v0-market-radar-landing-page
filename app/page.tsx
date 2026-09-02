"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { TENDERS_ENABLED } from "@/lib/flags"

// WhatsApp demo-call CTA (prefilled Hebrew).
const WA_DEMO = "https://wa.me/972559137417?text=" +
  encodeURIComponent("היי! אשמח לקבוע שיחת דמו קצרה על North Star Radar לעסק שלי")

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
          <a href="#whats-inside" className="hover:text-gray-900 transition-colors">מה יש בדוח</a>
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

// ── Live report showcase (rendered with the REAL report CSS — never drifts) ──
// Injects the report stylesheet once, then renders `.rpt`-scoped fragments from
const HERO_ALERTS = [
  // Tender alert is feature-flagged with the module (red = real deadline, only
  // when tenders are ON). While off: a calm news card — no artificial urgency,
  // traffic-light discipline (no red card at all).
  ...(TENDERS_ENABLED
    ? [{ icon: "📋", title: "מכרז חדש רלוונטי אליך — נסגר בעוד 7 ימים", src: "מקור: מכרזים ממשלתיים", chip: "דדליין", color: "#dc2626", chipBg: "#dc2626" }]
    : [{ icon: "📰", title: "זוהתה כתבה חדשה שרלוונטית לעסק שלך", src: "מקור: חדשות רלוונטיות", chip: "עדכון", color: "#475569", chipBg: "#475569" }]),
  // Competitor tracking leads the stack — it's the flagship module.
  // Copy states only what we actually measure: posts we scraped and Google
  // reviews we read. (The previous "מתחרה עדכן מחירים" card was dropped: we
  // don't detect pricing changes, so it promised something we can't deliver.)
  { icon: "🔍", title: "המתחרה שלך פרסם 5 פוסטים וקיבל 7 ביקורות חדשות", src: "מקור: מעקב מתחרים", chip: "מעקב מתחרים", color: "#d97706", chipBg: "#d97706" },
  { icon: "⭐", title: "הדירוג של מתחרה בגוגל ירד ל-4.1 — לקוחות מתלוננים על זמינות", src: "מקור: מעקב מתחרים", chip: "הזדמנות", color: "#0d9488", chipBg: "#0d9488" },
  { icon: "🤖", title: "העסק שלך במקום 2 בהמלצות צ'אט ג'י.פי.טי", src: "מקור: דירוג במנועי AI", chip: "הישג", color: "#16a34a", chipBg: "#16a34a" },
  { icon: "🤝", title: "3 שותפים פוטנציאליים חדשים באזור שלך", src: "מקור: ערוצי הפצה", chip: "הזדמנות", color: "#0d9488", chipBg: "#0d9488" },
  { icon: "📈", title: "מילת מפתח בתחום שלך עלתה 18% מהרבעון הקודם", src: "מקור: מגמות מפתח", chip: "טרנד", color: "#0d9488", chipBg: "#0d9488" },
]

const HERO_ALERT_CSS = `
  .halert-stack{display:flex;flex-direction:column;gap:12px;max-width:420px;width:100%}
  .halert-card{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid #e5e7eb;border-inline-start-width:5px;border-radius:14px;padding:14px 16px;box-shadow:0 6px 20px -8px rgba(15,23,42,.18);
    opacity:0;transform:translateY(16px) scale(.98);animation:halertCycle 12s ease-in-out infinite}
  .halert-stack:hover .halert-card{animation-play-state:paused}
  .halert-card:nth-child(1){animation-delay:0s}
  .halert-card:nth-child(2){animation-delay:2.2s}
  .halert-card:nth-child(3){animation-delay:4.4s}
  .halert-card:nth-child(4){animation-delay:6.6s}
  .halert-card:nth-child(5){animation-delay:8.8s}
  .halert-icon{flex:none;font-size:22px;line-height:1}
  .halert-body{flex:1;min-width:0}
  .halert-title{font-weight:700;font-size:14.5px;color:#0f172a;line-height:1.35}
  .halert-src{font-size:11.5px;color:#94a3b8;margin-top:3px}
  .halert-chip{flex:none;font-size:11px;font-weight:800;color:#fff;border-radius:20px;padding:4px 11px;white-space:nowrap}
  @keyframes halertCycle{
    0%{opacity:0;transform:translateY(16px) scale(.98)}
    5%{opacity:1;transform:translateY(0) scale(1)}
    9%{transform:translateY(0) scale(1.025)}
    15%{transform:translateY(0) scale(1)}
    90%{opacity:1;transform:translateY(0) scale(1)}
    100%{opacity:0;transform:translateY(16px) scale(.98)}
  }
  @media (prefers-reduced-motion: reduce){
    .halert-card{opacity:1;transform:none;animation:none}
  }
`

function HeroAlertStack() {
  return (
    <div className="flex flex-col items-center lg:items-start">
      <style dangerouslySetInnerHTML={{ __html: HERO_ALERT_CSS }} />
      <div className="halert-stack" dir="rtl">
        {HERO_ALERTS.map((c) => (
          <div className="halert-card" key={c.title} style={{ borderInlineStartColor: c.color }}>
            <div className="halert-icon">{c.icon}</div>
            <div className="halert-body">
              <div className="halert-title">{c.title}</div>
              <div className="halert-src">{c.src}</div>
            </div>
            <span className="halert-chip" style={{ background: c.chipBg }}>{c.chip}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm text-gray-400">התראות מתוך הדוח השבועי</p>
    </div>
  )
}

const faqs = [
  { q: "מה בעצם מקבלים?", a: "דוח שוק שבועי אחד, מותאם לעסק שלך: שותפים פוטנציאליים, מה קורה אצל המתחרים, טרנדים של השוק, והדירוג שלך בגוגל ובמנועי AI — עם פעולות ברורות לשבוע." },
  { q: "מאיפה מגיע המידע?", a: "נתוני חיפוש אמיתיים (Google), בדיקת דירוג אמיתית בגוגל ובמנועי AI, וסריקת מקורות גלויים ומאומתים. כל הלינקים מאומתים — לא מומצאים." },
  { q: "כמה זמן עד הדוח הראשון?", a: "הסריקה הראשונית רצה תוך כשעה מההרשמה, ואז מקבלים דוח שבועי קבוע." },
  { q: "האם צריך ידע טכנולוגי?", a: "בכלל לא. נרשמים, מגדירים את העסק בכמה שדות, והדוח מגיע אוטומטית. הכל בעברית." },
  { q: "מה ההבדל מחיפוש ב-Google?", a: "Google מחזיר מידע כללי. הרדאר מנתח את השוק הספציפי שלך פעם בשבוע ומרכז הכל לדוח אחד עם פעולות מותאמות." },
  { q: "מה המחיר וההתחייבות?", a: "79 ₪ לחודש, כל המודולים כלולים, ביטול בכל רגע." },
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

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pt-14 pb-8 sm:px-6">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div className="text-center lg:text-right">
            <div
              className="mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium"
              style={{ borderColor: "#0D9488", color: "#0D9488", background: "#F0FDFA" }}
            >
              <span className="font-extrabold">שלב א׳</span>
              <span className="opacity-40">·</span>
              📡 אתה מגדיר את העסק שלך
            </div>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl" style={{ color: "#0F172A" }}>
              כל מה שקורה בשוק שלך —<br />
              <span style={{ color: "#0D9488" }}>בדוח אחד שבועי</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg text-gray-500 leading-relaxed lg:mx-0">
              בדיוק מה שהמתחרים שלך מפרסמים, מה כותבים עליהם בגוגל, שותפים חדשים, טרנדים של השוק
              והדירוג שלך בגוגל ובמנועי AI — מרוכז לדוח אחד, כל שבוע, מותאם לעסק שלך.
            </p>

            <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center lg:justify-start">
              <Link
                href="/signup"
                className="rounded-xl px-8 py-3.5 text-center text-base font-bold text-white shadow-lg transition-all hover:scale-105 hover:opacity-95"
                style={{ backgroundColor: "#0D9488" }}
              >
                התחל עכשיו ←
              </Link>
              <a
                href={WA_DEMO}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border-2 px-8 py-3.5 text-center text-base font-bold transition-all hover:scale-105"
                style={{ borderColor: "#25D366", color: "#128C4B" }}
              >
                קבע שיחת דמו 💬
              </a>
            </div>
            <p className="mt-4 text-sm text-gray-400">
              או{" "}
              <a href="/r/demo" target="_blank" rel="noopener noreferrer" className="font-semibold text-gray-500 underline hover:text-gray-700">
                צפה בדוח לדוגמה →
              </a>{" "}
              (עסק להמחשה, ללא הרשמה)
            </p>
          </div>

          {/* Industry-neutral animated alert stack — the product's value moment */}
          <div className="flex justify-center lg:justify-end">
            <HeroAlertStack />
          </div>
        </div>
      </section>

      {/* ── TRUST STRIP ──────────────────────────────────────────────────── */}
      <section className="border-y border-gray-100 bg-gray-50 py-4">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-8 gap-y-2 px-4 text-center text-sm text-gray-500 sm:px-6">
          <span className="flex items-center gap-1.5"><span style={{ color: "#0D9488" }}>✓</span> הדירוג נמדד באמת בגוגל וב-AI</span>
          <span className="flex items-center gap-1.5"><span style={{ color: "#0D9488" }}>✓</span> כל הלינקים מאומתים</span>
          <span className="flex items-center gap-1.5"><span style={{ color: "#0D9488" }}>✓</span> נתוני חיפוש אמיתיים</span>
        </div>
      </section>

      {/* ── WHAT YOU GET (stage 2) ───────────────────────────────────────── */}
      {/* The report's actual contents, one card per module. Every line here
          describes something the product really produces — tenders are absent
          because that module is flagged off. */}
      <section id="whats-inside" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="mb-3 flex justify-center">
          <span
            className="rounded-full px-3.5 py-1 text-xs font-extrabold"
            style={{ backgroundColor: "#0D948815", color: "#0D9488" }}
          >
            שלב ב׳
          </span>
        </div>
        <h2 className="text-center text-3xl font-extrabold leading-tight sm:text-4xl" style={{ color: "#0F172A" }}>
          מה המערכת מוצאת לך —<br />
          <span style={{ color: "#0D9488" }}>וכל זה בדוח אחד, כל שבוע</span>
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-center text-lg text-gray-500 leading-relaxed">
          אתה לא צריך לחפש כלום. הרדאר סורק בשבילך את השוק, את המתחרים ואת המיקום שלך —
          ומרכיב מזה דוח אחד עם מה שקרה ומה לעשות עם זה.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: "📊",
              t: "השוואה של העסק שלך מול המתחרים והשוק",
              d: "איפה אתה עומד ביחס אליהם — דירוג, נוכחות וביקורות — ומה הפער שאפשר לסגור.",
            },
            {
              icon: "🔍",
              t: "מעקב מתחרים",
              d: "מה הם פרסמו ברשתות (פוסטים, לייקים, תגובות), מה כתבו עליהם בגוגל, וכל שינוי מהותי באתר שלהם — מוצר חדש, מחיר או מבצע.",
            },
            {
              icon: "📈",
              t: "טרנדים ומילות מפתח",
              d: "מה עולה ומה יורד בתחום שלך, עם נפחי חיפוש אמיתיים ומגמה של 12 חודשים אחורה.",
            },
            {
              icon: "🤖",
              t: "דירוג במנועי AI",
              d: "איך העסק שלך מופיע כשלקוחות שואלים את ChatGPT או Gemini — ומי מוזכר במקומך.",
            },
            {
              icon: "📅",
              t: "כנסים וחדשות רלוונטיים",
              d: "כנסים קרובים בתחום שלך עם מועדי הרשמה, וחדשות שנוגעות ישירות לעסק — בלי רעש.",
            },
            {
              icon: "🔎",
              t: "דירוג SEO בגוגל",
              d: "המיקום שלך על מילות המפתח שחשובות לך, נמדד בפועל — לא הערכה.",
            },
            {
              icon: "🤝",
              t: "ערוצי הפצה ושותפים פוטנציאליים",
              d: "עסקים באזור שלך שיכולים להפנות אליך לקוחות, לפי הערוצים שתגדיר.",
            },
          ].map((f) => (
            <div key={f.t} className="flex gap-3.5 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <span className="text-2xl leading-none">{f.icon}</span>
              <div>
                <div className="text-base font-bold" style={{ color: "#0F172A" }}>{f.t}</div>
                <p className="mt-1 text-sm text-gray-500 leading-relaxed">{f.d}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <Link
            href="/signup"
            className="rounded-xl px-8 py-3.5 text-center text-base font-bold text-white shadow-lg transition-all hover:scale-105 hover:opacity-95"
            style={{ backgroundColor: "#0D9488" }}
          >
            התחל עכשיו ←
          </Link>
          <Link
            href="/r/demo"
            className="rounded-xl border-2 px-8 py-3.5 text-center text-base font-bold transition-all hover:bg-gray-50"
            style={{ borderColor: "#0D9488", color: "#0D9488" }}
          >
            צפה בדוח לדוגמה
          </Link>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section id="how" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="mb-16 text-center text-3xl font-extrabold" style={{ color: "#0F172A" }}>
          איך זה עובד?
        </h2>
        <div className="flex flex-col gap-12 lg:flex-row">
          {[
            { num: "1", icon: "🏢", title: "נרשמים ומגדירים את העסק", desc: "שם, תחום ואזור פעילות. פחות משתי דקות." },
            { num: "2", icon: "🤖", title: "סריקה ראשונית תוך שעה", desc: "הרדאר סורק שותפים, מתחרים, דירוג וטרנדים — ומרכיב את הדוח." },
            { num: "3", icon: "📩", title: "דוח ראשון + דוח שבועי קבוע", desc: "מקבלים דוח מלא, ואז עדכון אוטומטי כל שבוע — בלי לחפש כלום." },
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
                <div className="absolute top-7 hidden text-2xl text-gray-300 lg:block" style={{ left: "-1rem" }}>←</div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── PRICING ──────────────────────────────────────────────────────── */}
      <section id="pricing" className="bg-gray-50 py-20">
        <div className="mx-auto max-w-xl px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-extrabold" style={{ color: "#0F172A" }}>תמחור פשוט. הכל כלול.</h2>
            <p className="mt-3 text-gray-500">מסלול אחד. כל המודולים. ללא הפתעות.</p>
          </div>

          <div className="relative rounded-2xl bg-white p-10 shadow-xl" style={{ border: "2px solid #0D9488" }}>
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
                "דוח שוק שבועי מלא, מותאם לעסק",
                "חדשות רלוונטיות לעסק שלך",
                "שותפים ולידים לפי ערוצי הפצה",
                "מעקב מתחרים + הזדמנויות",
                "דירוג בגוגל ובמנועי AI + טרנדים",
                "פעולות ברורות לכל שבוע",
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
              התחל עכשיו ←
            </Link>
            <p className="mt-4 text-center text-xs text-gray-400">ביטול בכל רגע · תשלום מאובטח</p>
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

      {/* ── CLOSING CTA ──────────────────────────────────────────────────── */}
      <section className="py-24" style={{ backgroundColor: "#0F172A" }}>
        <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
          <h2 className="mb-5 text-4xl font-extrabold text-white leading-tight">
            כל השוק שלך — בדוח אחד, כל שבוע
          </h2>
          <p className="mb-8 text-lg text-gray-400">הפסק לחפש בעשרה מקומות. תן לרדאר לרכז לך את זה.</p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/signup"
              className="inline-block rounded-xl px-10 py-4 text-lg font-extrabold text-white shadow-lg transition-all hover:scale-105 hover:opacity-90"
              style={{ backgroundColor: "#0D9488" }}
            >
              התחל עכשיו ←
            </Link>
            <a
              href={WA_DEMO}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-xl border-2 px-10 py-4 text-lg font-bold transition-all hover:scale-105"
              style={{ borderColor: "#25D366", color: "#4ade80" }}
            >
              קבע שיחת דמו 💬
            </a>
          </div>
          <p className="mt-5 text-sm text-gray-500">
            או{" "}
            <a href="/r/demo" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-300">
              צפה בדוח לדוגמה →
            </a>
          </p>
          <p className="mt-6 text-sm text-gray-500">
            ✓ 79 ₪ לחודש &nbsp;·&nbsp; ✓ ביטול בכל רגע &nbsp;·&nbsp; ✓ ללא התחייבות
          </p>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 bg-white py-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
            <div>
              <Image src="/whitelogo.png" alt="North Star Radar" width={200} height={56} className="h-12 w-auto object-contain mb-1" unoptimized />
              <p className="text-xs text-gray-400">מודיעין שוק לעסק שלך — בדוח אחד שבועי</p>
            </div>
            <nav className="flex flex-wrap justify-center gap-5 text-sm text-gray-500">
              <a href="#whats-inside" className="hover:text-gray-900 transition-colors">מה יש בדוח</a>
              <a href="#pricing" className="hover:text-gray-900 transition-colors">תמחור</a>
              <a href="/r/demo" target="_blank" rel="noopener noreferrer" className="hover:text-gray-900 transition-colors">דוח לדוגמה</a>
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
