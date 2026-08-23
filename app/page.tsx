"use client"

import { useState, useEffect, type ReactNode } from "react"
import Link from "next/link"
import Image from "next/image"
import { REPORT_CSS, DemandSpark } from "@/components/report/ReportView"
import { DEMO_REPORT } from "@/lib/report/demo-data"
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
  const t = DEMO_REPORT.tenders[0] // undefined when tenders module is off (card gated below)
  const g = DEMO_REPORT.leadGroups[0]
  // The landing showcases the CURRENT competitor module (מעקב מתחרים). The old
  // competitorTrends fragment is gone — that module is disabled.
  const ct = DEMO_REPORT.competitorTracking![0]
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
        {/* 1. Competitor tracking — the flagship, first in the showcase. */}
        <ModuleCard
          title="🔍 מעקב מתחרים"
          caption="מזין שמות של עד 5 מתחרים — ומקבל כל שבוע מה פרסמו, מה כתבו עליהם בגוגל וכמה עוקבים יש להם."
        >
          <Rpt>
            <div className="card" style={{ marginBottom: 0 }}>
              <div className="trk">
                <div className="trk-head">
                  <span className="trk-name">{ct.name}</span>
                </div>
                <div className="trk-nums">
                  {ct.reviews && (
                    <div className="trk-num stars">
                      <div className="big">{ct.reviews.rating}★</div>
                      <div className="cap">{ct.reviews.total?.toLocaleString('he-IL')} ביקורות בגוגל</div>
                    </div>
                  )}
                  {ct.followers.slice(0, 2).map((f, i) => (
                    <div className="trk-num" key={i}>
                      <div className="big">{f.count.toLocaleString('he-IL')}</div>
                      <div className="cap">עוקבים · {f.label}</div>
                    </div>
                  ))}
                </div>
                {ct.posts[0] && (
                  <div className="trk-post notable">
                    <div className="meta">
                      <span className={`plat ${ct.posts[0].platform}`}>{ct.posts[0].platformLabel}</span>
                      {ct.posts[0].date}
                    </div>
                    <div className="txt">{ct.posts[0].caption}</div>
                    {ct.posts[0].engagement && <div className="trk-eng">{ct.posts[0].engagement}</div>}
                  </div>
                )}
              </div>
            </div>
          </Rpt>
        </ModuleCard>

        {/* 2. Actions */}
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

        {/* 3. Tenders — feature-flagged off (hidden, not deleted) */}
        {TENDERS_ENABLED && t && (
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
        )}

        {/* 4. Partners / channels */}
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

// ── Hero visual: industry-NEUTRAL animated alert stack ──────────────────────
// CSS-only sequential fade/slide-in loop, pause-on-hover, reduced-motion safe.
// Cards deliberately span different modules/industries so no niche association.

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
  // Fictional competitors from the demo report — the flagship section renders
  // the REAL report components against them (no screenshots, no real business).
  const [ctA, ctB] = DEMO_REPORT.competitorTracking || []
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

      {/* ── FLAGSHIP: COMPETITOR TRACKING ────────────────────────────────── */}
      {/* Placed immediately after the trust strip: this is the headline feature,
          not one of eight. The fragment below is the REAL report component with
          the REAL report CSS, rendered from the demo company's (fictional)
          competitor data — same as the rest of the showcase, no screenshots. */}
      <section id="competitors" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="mb-3 flex justify-center">
          <span
            className="rounded-full px-3.5 py-1 text-xs font-extrabold"
            style={{ backgroundColor: "#0D948815", color: "#0D9488" }}
          >
            חדש · המודול המבוקש ביותר
          </span>
        </div>
        <h2 className="text-center text-3xl font-extrabold leading-tight sm:text-4xl" style={{ color: "#0F172A" }}>
          דע בדיוק מה המתחרים שלך עושים —<br />
          <span style={{ color: "#0D9488" }}>פוסטים, ביקורות וכל מהלך, כל שבוע</span>
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-center text-lg text-gray-500 leading-relaxed">
          אתה מזין רק <b>שמות</b> של עד 5 מתחרים. אנחנו מאתרים לבד את האתר, האינסטגרם, הפייסבוק,
          הלינקדאין ועמוד הגוגל שלהם — ומביאים כל שבוע מה הם פרסמו, כמה עוקבים יש להם,
          ומה הלקוחות שלהם כותבים עליהם בגוגל.
        </p>

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
          {/* What it actually does — honest, feature-by-feature. */}
          <div className="space-y-4">
            {[
              { icon: "📱", t: "כל פוסט שהם מפרסמים", d: "אינסטגרם, פייסבוק ולינקדאין — עם התאריך, הטקסט, כמה לייקים וכמה תגובות קיבלו, וקישור ישיר לפוסט." },
              { icon: "⭐", t: "הביקורות שלהם בגוגל", d: "הדירוג ומספר הביקורות, כמה ביקורות חדשות נוספו החודש, והאם הן טובות או חלשות מהממוצע שלהם." },
              { icon: "👥", t: "כמות העוקבים", d: "כמה עוקבים יש להם בכל רשת — ואיך זה משתנה מסריקה לסריקה." },
              { icon: "💡", t: "תובנות, לא רק נתונים", d: "מי הכי פעיל, על מה הם הכי מדברים, איזה פוסט הכי עבד להם, ואיפה נפתחה לך הזדמנות." },
            ].map((f) => (
              <div key={f.t} className="flex gap-3.5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <span className="text-2xl leading-none">{f.icon}</span>
                <div>
                  <div className="text-base font-bold" style={{ color: "#0F172A" }}>{f.t}</div>
                  <p className="mt-1 text-sm text-gray-500 leading-relaxed">{f.d}</p>
                </div>
              </div>
            ))}
            <p className="px-1 text-xs text-gray-400">
              המתחרים בדוגמה בדויים. בדוח שלך יופיעו המתחרים שאתה מגדיר.
            </p>
          </div>

          {/* LIVE fragment from the demo report. */}
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <Rpt>
              <div className="card" style={{ marginBottom: 0 }}>
                {[ctA, ctB].filter(Boolean).map((c, ci) => (
                  <div className="trk" key={ci}>
                    <div className="trk-head">
                      <span className="trk-name">{c!.name}</span>
                      <span className="trk-links">
                        {c!.links.slice(0, 3).map((l, j) => <a key={j}>{l.label}</a>)}
                      </span>
                    </div>
                    <div className="trk-nums">
                      {c!.reviews && (
                        <div className="trk-num stars">
                          <div className="big">{c!.reviews.rating}★</div>
                          <div className="cap">{c!.reviews.total?.toLocaleString("he-IL")} ביקורות בגוגל</div>
                        </div>
                      )}
                      {c!.followers.slice(0, 2).map((f, j) => (
                        <div className="trk-num" key={j}>
                          <div className="big">{f.count.toLocaleString("he-IL")}</div>
                          <div className="cap">עוקבים · {f.label}</div>
                        </div>
                      ))}
                    </div>
                    {c!.reviews?.sentiment && (
                      <div className={`trk-line ${c!.reviews.sentiment.dir === "up" ? "up" : "down"}`}>
                        {c!.reviews.sentiment.dir === "up" ? "📈" : "📉"} {c!.reviews.sentiment.text}
                      </div>
                    )}
                    {c!.posts.slice(0, 2).map((p, j) => (
                      <div className={`trk-post${p.notable ? " notable" : ""}`} key={j}>
                        <div className="meta">
                          <span className={`plat ${p.platform}`}>{p.platformLabel}</span>
                          {p.date}
                        </div>
                        <div className="txt">{p.caption}</div>
                        {p.engagement && <div className="trk-eng">{p.engagement}</div>}
                      </div>
                    ))}
                    {c!.insights[0] && (
                      <>
                        <div className="trk-sub">תובנות (45 יום)</div>
                        <div className="trk-ins">· {c!.insights[0]}</div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </Rpt>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <Link
            href="/signup"
            className="rounded-xl px-8 py-3.5 text-center text-base font-bold text-white shadow-lg transition-all hover:scale-105 hover:opacity-95"
            style={{ backgroundColor: "#0D9488" }}
          >
            התחל לעקוב אחרי המתחרים שלך ←
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

      {/* ── PAIN ─────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <h2 className="mb-10 text-center text-2xl font-extrabold sm:text-3xl" style={{ color: "#0F172A" }}>
          כמה מזה מוכר לך?
        </h2>
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            { icon: "🗂️", t: "לבדוק 5 אתרים ידנית", d: "מתחרים, טרנדים, חדשות ושותפים — כל אחד באתר אחר, כל שבוע מחדש." },
            { icon: "🤷", t: "לנחש לגבי המתחרים", d: "מה הם השיקו? איפה הם חזקים? בלי מעקב מסודר — לא באמת יודעים." },
            { icon: "⌛", t: "לגלות הזדמנות באיחור", d: "טרנד שעלה, שותף שנכנס לאזור — כשאתה שומע על זה, זה כבר מאוחר." },
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
            {TENDERS_ENABLED ? 8 : 7} מנועי מודיעין, דוח אחד
          </p>
          <p className="mb-10 text-center text-gray-500 max-w-xl mx-auto">
            לא צילומי מסך — אלה רכיבים אמיתיים מתוך הדוח עצמו. מה שתראו כאן זה בדיוק מה שתקבלו.
          </p>

          {/* Phone-frame demo report — loudly labeled as a fictional example */}
          <div className="mb-14 flex flex-col items-center">
            <div className="relative w-full max-w-[340px]">
              <span
                className="absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-5 py-2 text-sm font-extrabold text-white shadow-lg"
                style={{ backgroundColor: "#d97706" }}
              >
                🧪 דוח לדוגמה — עסק פיקטיבי להמחשה
              </span>
              <div
                className="relative overflow-hidden rounded-[2.2rem] border-[10px] border-gray-900 bg-gray-900 shadow-2xl"
                style={{ aspectRatio: "9 / 17" }}
              >
                <div className="absolute left-1/2 top-0 z-10 h-5 w-32 -translate-x-1/2 rounded-b-2xl bg-gray-900" />
                <iframe
                  src="/r/demo?embed=1"
                  title="דוח לדוגמה — עסק פיקטיבי להמחשה"
                  loading="lazy"
                  className="h-full w-full rounded-[1.5rem] bg-white"
                />
              </div>
            </div>
            <p className="mt-7 max-w-md text-center text-base font-semibold text-gray-600">
              ככה נראה הדוח שמגיע אליך בוואטסאפ, כל שבוע
            </p>
          </div>

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
