"use client"

import { useState, useEffect, type ReactNode } from "react"
import Link from "next/link"
import Image from "next/image"
import { REPORT_CSS, DemandSpark } from "@/components/report/ReportView"
import { DEMO_REPORT } from "@/lib/report/demo-data"

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
          <a href="#report" className="hover:text-gray-900 transition-colors">מה יש בדוח</a>
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
// the same demo data that powers /r/demo. All 8 intelligence modules, compact.

// Scoped wrapper: report CSS applies, but neutralize the full-page base rules
// (min-height:100vh / page bg) so fragments sit inside the landing cards.
function Rpt({ children }: { children: ReactNode }) {
  return (
    <div className="rpt" dir="rtl" style={{ minHeight: 0, background: "transparent", fontSize: "16px" }}>
      {children}
    </div>
  )
}

// One rank cell, matching ReportView (unranked → calm muted label, not a bare dash).
function RankCell({ rank, warn, unranked }: { rank: string; warn?: boolean; unranked?: boolean }) {
  return unranked
    ? <div className="rank-unranked">לא מדורג<br />עדיין</div>
    : <div className={`rank-num${warn ? " warn" : ""}`}>{rank}</div>
}

function ModuleCard({ title, caption, children }: { title: string; caption: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-1 text-base font-bold" style={{ color: "#0F172A" }}>{title}</div>
      <p className="mb-4 text-sm text-gray-500">{caption}</p>
      {children}
    </div>
  )
}

function ReportShowcase() {
  const a = DEMO_REPORT.actions[0]
  const t = DEMO_REPORT.tenders[0]
  const g = DEMO_REPORT.leadGroups[0]
  const ct = DEMO_REPORT.competitorTrends![0]
  const seoP = DEMO_REPORT.seoPrimary!
  const seoX = DEMO_REPORT.seoExtras || []
  const ai = DEMO_REPORT.seoAi!
  const demand = DEMO_REPORT.demand!
  const trend = DEMO_REPORT.trends[0]
  const news = DEMO_REPORT.news[0]

  return (
    <>
      {/* Inject the real report stylesheet + fonts once. */}
      <link href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;500;700;900&family=Heebo:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      <style dangerouslySetInnerHTML={{ __html: REPORT_CSS }} />

      {/* Metrics strip — the "everything at a glance" row */}
      <Rpt>
        <div className="metrics-grid">
          {DEMO_REPORT.metrics.map((m, i) => (
            <div className={`metric${m.hot ? " hot" : ""}`} key={i}>
              <div className="num">{m.num}</div>
              {m.badge && <div><span className={`badge ${m.badge.kind}`}>{m.badge.text}</span></div>}
              <div className="label" dangerouslySetInnerHTML={{ __html: m.label }} />
            </div>
          ))}
        </div>
      </Rpt>

      {/* 8 module cards */}
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        {/* 1. Actions */}
        <ModuleCard title="🎯 המלצות לפעולה" caption="כל שבוע: מה לעשות, לפי סדר דחיפות.">
          <Rpt>
            <div className={`action${a.kind ? " " + a.kind : ""}`} style={{ marginBottom: 0 }}>
              <div className="action-num">1</div>
              <div className="action-body">
                <div className="action-title">{a.title}</div>
                <div className="action-why">{a.why}</div>
                <div className="action-src">{a.src}</div>
              </div>
              <span className={`chip ${a.chip.kind}`}>{a.chip.text}</span>
            </div>
          </Rpt>
        </ModuleCard>

        {/* 2. Tenders */}
        <ModuleCard title="📋 מכרזים" caption="מכרזים רלוונטיים ממקורות רשמיים, לפני שהם נסגרים.">
          <Rpt>
            <div className="card" style={{ marginBottom: 0 }}>
              <div className={`row${t.hot ? " hot-row" : ""}`}>
                <div className="row-main">
                  <div className="row-title">{t.title}{t.pill && <span className={`pill ${t.pill.kind}`}>{t.pill.text}</span>}</div>
                  <div className="row-sub">{t.sub}</div>
                </div>
                <div className="row-side"><span className="deadline">{t.side}</span></div>
              </div>
            </div>
          </Rpt>
        </ModuleCard>

        {/* 3. Partners / channels */}
        <ModuleCard title="🤝 שותפים וערוצי הפצה" caption="שותפים אמיתיים באזור שלך, לפי הערוצים שתגדיר.">
          <Rpt>
            <div className="card" style={{ marginBottom: 0 }}>
              <div className="channel-tag">{g.channel}</div>
              {g.leads.map((l, i) => (
                <div className="row" key={i}>
                  <div className="row-main">
                    <div className="row-title">{l.title}{l.matchTag && <span className="pill amber">{l.matchTag.text}</span>}</div>
                    <div className="row-sub">{l.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </Rpt>
        </ModuleCard>

        {/* 4. Competitors — trends + amber opportunity */}
        <ModuleCard title="🔍 מתחרים" caption="מה המתחרים עושים — ואיפה ההזדמנות שלך.">
          <Rpt>
            <div className="card" style={{ marginBottom: 0 }}>
              <div className="comp-intro">לא זוהו שינויים מהותיים השבוע — אבל הנה מה שקורה אצל המתחרים:</div>
              <div className="row">
                <div className="row-main">
                  <div className="row-title">{ct.name}</div>
                  <div className="row-sub">{ct.topic}</div>
                  {ct.opportunity && (
                    <div className="comp-change">
                      <span className="pill amber">נקודה למחשבה</span>
                      <span className="opp-text">{ct.opportunity}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Rpt>
        </ModuleCard>

        {/* 5. Google ranking */}
        <ModuleCard title="📊 דירוג בגוגל" caption="איפה אתה מדורג על המילים שחשובות, עם נפחי חיפוש אמיתיים.">
          <Rpt>
            <div className="card" style={{ marginBottom: 0 }}>
              <div className="rank-row">
                <RankCell rank={seoP.rank} warn={seoP.warn} unranked={seoP.unranked} />
                <div className="rank-main">
                  <div className="rank-title">{seoP.query}</div>
                  <div className="rank-sub">{seoP.sub}</div>
                </div>
              </div>
              {seoX.slice(0, 2).map((s, i) => (
                <div className="rank-row" key={i}>
                  <RankCell rank={s.rank} warn={s.warn} unranked={s.unranked} />
                  <div className="rank-main">
                    <div className="rank-title">{s.query}</div>
                    <div className="rank-sub">{s.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </Rpt>
        </ModuleCard>

        {/* 6. AI (GEO) ranking */}
        <ModuleCard title="🤖 דירוג במנועי AI" caption="ככה אתה נראה כשלקוחות שואלים את ChatGPT.">
          <Rpt>
            <div className="card" style={{ marginBottom: 0 }}>
              <div className="ai-q">שאלה במנועי AI: <b>"{ai.question}"</b></div>
              <div className="ai-engines">
                {ai.engines.map((e, i) => (
                  <div className={`ai-eng ${e.appeared ? "on" : "off"}`} key={i}>
                    <div className="eng-name">{e.name}</div>
                    <div className="eng-rank">{e.rank}</div>
                  </div>
                ))}
              </div>
            </div>
          </Rpt>
        </ModuleCard>

        {/* 7. Trends + demand sparkline */}
        <ModuleCard title="📈 טרנדים ומילות מפתח" caption="מה עולה בשוק שלך — נתוני חיפוש אמיתיים, 12 חודשים אחורה.">
          <Rpt>
            <div className="card" style={{ marginBottom: 0 }}>
              <div className="demand">
                <div className="demand-head"><b>{demand.label}</b> · "{demand.keyword}"</div>
                <DemandSpark series={demand.series} />
              </div>
              <div className={`row${trend.hot ? " hot-row" : ""}`}>
                <div className="row-main">
                  <div className="row-title">{trend.title}{trend.hot && <span className="pill amber">🔥 חם</span>}</div>
                  <div className="row-sub">{trend.sub}</div>
                </div>
                <div className="row-side"><span className={`badge ${trend.badge.kind}`}>{trend.badge.text}</span></div>
              </div>
            </div>
          </Rpt>
        </ModuleCard>

        {/* 8. News */}
        <ModuleCard title="📰 חדשות רלוונטיות" caption="רק החדשות שנוגעות לעסק שלך.">
          <Rpt>
            <div className="card" style={{ marginBottom: 0 }}>
              <div className="row">
                <div className="row-main">
                  <div className="row-title">{news.title}{news.pill && <span className="pill amber">{news.pill}</span>}</div>
                  <div className="row-sub">{news.sub}</div>
                </div>
              </div>
            </div>
          </Rpt>
        </ModuleCard>
      </div>
    </>
  )
}

const faqs = [
  { q: "מה בעצם מקבלים?", a: "דוח שוק שבועי אחד, מותאם לעסק שלך: מכרזים רלוונטיים, שותפים פוטנציאליים, מה קורה אצל המתחרים, והדירוג שלך בגוגל ובמנועי AI — עם פעולות ברורות לשבוע." },
  { q: "מאיפה מגיע המידע?", a: "מכרזים ממקורות רשמיים (למשל רכבת ישראל דרך ה-API שלה), נתוני חיפוש אמיתיים, ובדיקת דירוג בגוגל ובמנועי AI. כל הלינקים מאומתים — לא מומצאים." },
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
              📡 מודיעין שוק לעסק שלך — בדוח אחד
            </div>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl" style={{ color: "#0F172A" }}>
              כל מה שקורה בשוק שלך —<br />
              <span style={{ color: "#0D9488" }}>בדוח אחד שבועי</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg text-gray-500 leading-relaxed lg:mx-0">
              מכרזים רלוונטיים, שותפים חדשים, מה קורה אצל המתחרים, והדירוג שלך בגוגל ובמנועי AI —
              מרוכז לדוח אחד, כל שבוע, מותאם לעסק שלך.
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

          {/* Phone-frame mockup showing the REAL demo report (iframe, never drifts) */}
          <div className="flex justify-center">
            <div
              className="relative w-full max-w-[360px] overflow-hidden rounded-[2.2rem] border-[10px] border-gray-900 bg-gray-900 shadow-2xl"
              style={{ aspectRatio: "9 / 17" }}
            >
              <div className="absolute left-1/2 top-0 z-10 h-5 w-32 -translate-x-1/2 rounded-b-2xl bg-gray-900" />
              <iframe
                src="/r/demo"
                title="דוח לדוגמה"
                loading="lazy"
                className="h-full w-full rounded-[1.5rem] bg-white"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── TRUST STRIP ──────────────────────────────────────────────────── */}
      <section className="border-y border-gray-100 bg-gray-50 py-4">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-8 gap-y-2 px-4 text-center text-sm text-gray-500 sm:px-6">
          <span className="flex items-center gap-1.5"><span style={{ color: "#0D9488" }}>✓</span> מכרזים ממקורות רשמיים</span>
          <span className="flex items-center gap-1.5"><span style={{ color: "#0D9488" }}>✓</span> כל הלינקים מאומתים</span>
          <span className="flex items-center gap-1.5"><span style={{ color: "#0D9488" }}>✓</span> נתוני חיפוש אמיתיים</span>
        </div>
      </section>

      {/* ── PAIN ─────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <h2 className="mb-10 text-center text-2xl font-extrabold sm:text-3xl" style={{ color: "#0F172A" }}>
          כמה מזה מוכר לך?
        </h2>
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            { icon: "🗂️", t: "לבדוק 5 אתרים ידנית", d: "מכרזים, מתחרים, טרנדים — כל אחד באתר אחר, כל שבוע מחדש." },
            { icon: "🤷", t: "לנחש לגבי המתחרים", d: "מה הם השיקו? איפה הם חזקים? בלי מעקב מסודר — לא באמת יודעים." },
            { icon: "⌛", t: "לגלות מכרז אחרי שנסגר", d: "ההזדמנות הייתה שם, אבל היא עברה לפני שהספקת לראות אותה." },
          ].map((p) => (
            <div key={p.t} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="mb-3 text-3xl">{p.icon}</div>
              <h3 className="mb-2 text-base font-bold" style={{ color: "#0F172A" }}>{p.t}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{p.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── REPORT SHOWCASE (live fragments, real report components/CSS) ──── */}
      <section id="report" className="bg-gray-50 py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2 className="mb-3 text-center text-2xl font-extrabold sm:text-3xl" style={{ color: "#0F172A" }}>
            מה נכנס לדוח השבועי שלך
          </h2>
          <p className="mb-2 text-center text-lg font-bold" style={{ color: "#0D9488" }}>
            8 מנועי מודיעין, דוח אחד
          </p>
          <p className="mb-10 text-center text-gray-500 max-w-xl mx-auto">
            לא צילומי מסך — אלה רכיבים אמיתיים מתוך הדוח עצמו. מה שתראו כאן זה בדיוק מה שתקבלו.
          </p>
          <ReportShowcase />
          <div className="mt-10 text-center">
            <a
              href="/r/demo"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-xl border-2 px-8 py-3.5 text-base font-bold transition-all hover:scale-105 hover:bg-white"
              style={{ borderColor: "#0D9488", color: "#0D9488" }}
            >
              צפה בדוח המלא לדוגמה →
            </a>
          </div>
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
            { num: "2", icon: "🤖", title: "סריקה ראשונית תוך שעה", desc: "הרדאר סורק מכרזים, שותפים, מתחרים ודירוג — ומרכיב את הדוח." },
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
                "מכרזים רלוונטיים ממקורות רשמיים",
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
              <a href="#report" className="hover:text-gray-900 transition-colors">מה יש בדוח</a>
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
