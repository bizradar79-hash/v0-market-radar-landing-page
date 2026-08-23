// Shared, self-contained renderer for the client web report. Used by both the
// permanent live link (/r/[token]) and the frozen archive link
// (/r/a/[snapshot_token]). Pure render from assembled ReportData — no data
// fetching, no AI. Design copied verbatim from report-design-reference.html.
import type { ReportData } from '@/lib/report/assemble'

export const REPORT_CSS = `
  :root{--ink:#14212d;--ink-soft:#485866;--ink-faint:#84939f;--bg:#f4f7f6;--card:#ffffff;--line:#e0e7e4;--teal:#0d9488;--teal-bright:#10b981;--teal-deep:#0a6b62;--teal-wash:#e0f2ef;--teal-glow:#ccfbf1;--navy:#0f2033;--navy-2:#16304a;--amber:#d97706;--amber-wash:#fef3c7;--red:#dc2626;--red-wash:#fee2e2;--green:#16a34a;--green-wash:#dcfce7;--gold:#f59e0b;}
  .rpt *{margin:0;padding:0;box-sizing:border-box}
  .rpt{font-family:'Heebo',sans-serif;background:var(--bg);color:var(--ink);line-height:1.65;font-size:16px;min-height:100vh}
  .rpt .wrap{max-width:780px;margin:0 auto;padding:0 20px}
  .rpt header{background:linear-gradient(135deg,var(--navy) 0%,var(--navy-2) 60%,#0d3b45 100%);color:#fff;padding:28px 0 36px;position:relative;overflow:hidden}
  .rpt header::after{content:'';position:absolute;inset-inline-end:-80px;top:-80px;width:280px;height:280px;border-radius:50%;background:radial-gradient(circle,rgba(16,185,129,.22),transparent 65%);pointer-events:none}
  .rpt .brand{display:flex;align-items:center;gap:10px;margin-bottom:26px}
  .rpt .brand svg{flex:none}
  .rpt .brand-name{font-size:14px;font-weight:600;letter-spacing:.04em;color:#bcd2e2}
  .rpt .archive-badge{display:inline-block;margin-bottom:14px;background:rgba(217,119,6,.18);border:1px solid rgba(217,119,6,.5);color:#fbbf24;font-size:12.5px;font-weight:700;border-radius:20px;padding:4px 14px}
  .rpt h1{font-family:'Frank Ruhl Libre',serif;font-weight:700;font-size:27px;line-height:1.3;color:#fff}
  .rpt .report-meta{display:flex;flex-wrap:wrap;gap:8px 22px;font-size:13.5px;color:#93a9bb;margin-top:10px}
  .rpt .report-meta b{color:#fff;font-weight:600}
  .rpt .achieve{margin-top:22px;background:linear-gradient(120deg,rgba(16,185,129,.16),rgba(16,185,129,.05));border:1px solid rgba(16,185,129,.45);border-radius:14px;padding:14px 18px;display:flex;align-items:center;gap:14px}
  .rpt .achieve .medal{font-size:28px;flex:none}
  .rpt .achieve .a-title{font-weight:700;font-size:15.5px;color:#d7fff2}
  .rpt .achieve .a-sub{font-size:13.5px;color:#9fc9bd}
  .rpt .thesis{background:var(--card);border-bottom:1px solid var(--line);padding:38px 0 30px}
  .rpt .thesis p.big{font-family:'Frank Ruhl Libre',serif;font-size:28px;font-weight:500;line-height:1.45;color:var(--ink);max-width:660px}
  .rpt .thesis p.big em{font-style:normal;font-weight:700;background:linear-gradient(transparent 62%,var(--teal-glow) 62%);color:var(--teal-deep);padding:0 2px}
  .rpt .thesis .sub{margin-top:12px;color:var(--ink-soft);font-size:15.5px;max-width:620px}
  .rpt .metrics{background:var(--card);padding:26px 0 36px;border-bottom:1px solid var(--line)}
  .rpt .metrics-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:14px}
  .rpt .metric{background:var(--bg);border:1px solid var(--line);border-radius:14px;padding:18px 16px 15px;position:relative;transition:transform .15s}
  .rpt .metric.hot{background:linear-gradient(160deg,var(--teal-wash),#fff 70%);border-color:var(--teal);box-shadow:0 4px 18px -6px rgba(13,148,136,.25)}
  .rpt .metric .num{font-family:'Frank Ruhl Libre',serif;font-weight:900;font-size:38px;line-height:1;color:var(--ink)}
  .rpt .metric.hot .num{color:var(--teal-deep)}
  .rpt .badge{display:inline-flex;align-items:center;gap:3px;font-family:'Heebo',sans-serif;font-size:12px;font-weight:800;border-radius:20px;padding:2.5px 10px;margin-top:8px}
  .rpt .badge.up{background:var(--green-wash);color:var(--green)}
  .rpt .badge.down{background:var(--red-wash);color:var(--red)}
  .rpt .badge.flat{background:#eef1f0;color:var(--ink-faint)}
  .rpt .badge.new{background:var(--amber-wash);color:var(--amber)}
  .rpt .metric .label{font-size:12.5px;color:var(--ink-soft);margin-top:9px;line-height:1.4;font-weight:500}
  .rpt section{padding:42px 0 8px}
  .rpt .sec-head{display:flex;align-items:center;gap:12px;margin-bottom:6px}
  .rpt .sec-kicker{font-size:12px;font-weight:800;letter-spacing:.06em;color:#fff;background:var(--teal);border-radius:20px;padding:4px 14px;box-shadow:0 2px 8px -2px rgba(13,148,136,.4)}
  .rpt h2{font-family:'Frank Ruhl Libre',serif;font-weight:700;font-size:23px}
  .rpt .sec-bottomline{font-size:15.5px;color:var(--ink-soft);margin:6px 0 20px;max-width:660px}
  .rpt .sec-bottomline b{color:var(--ink);background:linear-gradient(transparent 65%,var(--teal-glow) 65%)}
  .rpt .action{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px 22px;margin-bottom:14px;display:flex;gap:16px;align-items:flex-start;border-inline-start:5px solid var(--teal);box-shadow:0 2px 10px -4px rgba(20,33,45,.08);position:relative}
  .rpt .action.urgent{border-inline-start-color:var(--red);background:linear-gradient(120deg,#fff 82%,var(--red-wash))}
  .rpt .action.watch{border-inline-start-color:var(--amber)}
  .rpt .action-num{flex:none;width:34px;height:34px;border-radius:10px;background:var(--navy);color:#fff;font-family:'Frank Ruhl Libre',serif;font-weight:700;font-size:18px;display:flex;align-items:center;justify-content:center;margin-top:2px}
  .rpt .action-body{flex:1}
  .rpt .action-title{font-weight:700;font-size:17px;line-height:1.4}
  .rpt .action-why{color:var(--ink-soft);font-size:14.5px;margin-top:6px}
  .rpt .action-why b{color:var(--ink)}
  .rpt .action-src{font-size:12.5px;color:var(--ink-faint);margin-top:9px}
  .rpt .chip{flex:none;font-size:12px;font-weight:800;border-radius:20px;padding:4px 13px;margin-top:2px}
  .rpt .chip.urgent{background:var(--red);color:#fff;box-shadow:0 2px 8px -2px rgba(220,38,38,.5)}
  .rpt .chip.watch{background:var(--amber);color:#fff}
  .rpt .chip.go{background:var(--teal-bright);color:#fff;box-shadow:0 2px 8px -2px rgba(16,185,129,.5)}
  .rpt .card{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden;margin-bottom:14px;box-shadow:0 2px 10px -4px rgba(20,33,45,.06)}
  .rpt .row{padding:16px 22px;border-bottom:1px solid var(--line);display:flex;gap:14px;align-items:baseline;justify-content:space-between;flex-wrap:wrap}
  .rpt .row:last-child{border-bottom:none}
  .rpt .row.hot-row{background:linear-gradient(120deg,var(--teal-wash) 0%,#fff 55%)}
  .rpt .row-main{flex:1;min-width:220px}
  .rpt .row-title{font-weight:700;font-size:15.5px}
  .rpt .row-sub{font-size:13.5px;color:var(--ink-soft);margin-top:3px}
  .rpt .row-side{font-size:13px;color:var(--ink-faint);text-align:left;flex:none}
  .rpt .row-side b{color:var(--ink);font-weight:700}
  .rpt .pill{display:inline-block;font-size:11.5px;font-weight:800;border-radius:14px;padding:2.5px 11px;margin-inline-start:8px;vertical-align:2px}
  .rpt .pill.teal{background:var(--teal);color:#fff}
  .rpt .pill.amber{background:var(--amber-wash);color:var(--amber)}
  .rpt .pill.red{background:var(--red-wash);color:var(--red);font-weight:800}
  .rpt .deadline{color:var(--red);font-weight:800}
  .rpt .score-pill{display:inline-block;min-width:52px;text-align:center;background:var(--teal-wash);color:var(--teal-deep);font-weight:800;font-size:14px;border-radius:10px;padding:4px 10px}
  .rpt .more-link{display:block;text-align:center;padding:12px;font-size:13.5px;font-weight:700;color:var(--teal-deep);text-decoration:none;background:#f8fbfa}
  .rpt .more-link:hover{background:var(--teal-wash)}
  .rpt .comp-change{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:5px;font-size:13px}
  .rpt .delta{font-weight:800;font-size:12.5px;border-radius:8px;padding:2px 9px}
  .rpt .delta.bad{background:var(--red-wash);color:var(--red)}
  .rpt .delta.good{background:var(--green-wash);color:var(--green)}
  .rpt .delta.neutral{background:#eef1f0;color:var(--ink-faint)}
  .rpt .rank-row{display:flex;align-items:center;gap:14px;padding:14px 22px;border-bottom:1px solid var(--line)}
  .rpt .rank-row:last-child{border-bottom:none}
  .rpt .rank-num{font-family:'Frank Ruhl Libre',serif;font-weight:900;font-size:24px;color:#fff;background:linear-gradient(135deg,var(--teal),var(--teal-bright));border-radius:12px;width:48px;height:48px;flex:none;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px -3px rgba(13,148,136,.5)}
  .rpt .rank-num.warn{background:linear-gradient(135deg,var(--amber),#f59e0b);box-shadow:0 3px 10px -3px rgba(217,119,6,.5)}
  .rpt .rank-unranked{flex:none;min-width:48px;min-height:48px;padding:6px 10px;border-radius:12px;background:#eef1f0;color:var(--ink-faint);font-size:11.5px;font-weight:700;line-height:1.3;display:flex;align-items:center;justify-content:center;text-align:center}
  .rpt .rank-main{flex:1}
  .rpt .rank-title{font-weight:700;font-size:15px}
  .rpt .rank-sub{font-size:13px;color:var(--ink-soft)}
  .rpt .channel-tag{font-size:12.5px;font-weight:800;color:var(--teal-deep);letter-spacing:.02em;padding:15px 22px 5px}
  .rpt .calm-note{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px 22px;color:var(--ink-soft);font-size:14.5px;box-shadow:0 2px 10px -4px rgba(20,33,45,.06)}
  .rpt .trk{padding:18px 22px;border-bottom:1px solid var(--line)}
  .rpt .trk:last-child{border-bottom:none}
  .rpt .trk-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
  .rpt .trk-name{font-weight:800;font-size:16.5px;color:var(--ink)}
  .rpt .trk-links{display:flex;gap:8px;flex-wrap:wrap}
  .rpt .trk-links a{font-size:11.5px;color:var(--teal-deep);text-decoration:none;border-bottom:1px solid var(--teal-glow)}
  .rpt .trk-nums{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
  .rpt .trk-num{background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:11px 15px;min-width:118px}
  .rpt .trk-num.stars{background:linear-gradient(160deg,var(--amber-wash),#fff 75%);border-color:var(--amber)}
  .rpt .trk-num .big{font-family:'Frank Ruhl Libre',serif;font-weight:900;font-size:25px;line-height:1.05;color:var(--ink)}
  .rpt .trk-num.stars .big{color:var(--amber)}
  .rpt .trk-num .cap{font-size:11.5px;color:var(--ink-soft);margin-top:5px;font-weight:600}
  .rpt .trk-line{font-size:13.5px;color:var(--ink-soft);margin-top:8px;line-height:1.55}
  .rpt .trk-line.up{color:var(--green)}
  .rpt .trk-line.down{color:var(--red)}
  .rpt .trk-sub{font-size:12px;font-weight:800;color:var(--ink-faint);margin-top:14px;letter-spacing:.02em}
  .rpt .trk-post{border-inline-start:3px solid var(--line);padding:2px 11px;margin-top:8px}
  .rpt .trk-post .meta{font-size:11px;color:var(--ink-faint);font-weight:600}
  .rpt .trk-post .txt{font-size:13.5px;color:var(--ink);margin-top:2px;line-height:1.5}
  .rpt .trk-ins{font-size:13.5px;color:var(--ink-soft);margin-top:6px;line-height:1.55}
  .rpt .comp-intro{padding:16px 22px;border-bottom:1px solid var(--line);color:var(--ink-soft);font-size:14.5px;background:#f8fbfa}
  .rpt .opp-text{font-size:13px;color:var(--amber);line-height:1.5}
  .rpt .src-link{font-size:12px;font-weight:700;color:var(--teal-deep);text-decoration:none;white-space:nowrap}
  .rpt .src-link:hover{text-decoration:underline}
  .rpt .lead-link{font-size:12.5px;font-weight:700;color:var(--teal-deep);text-decoration:none}
  .rpt .lead-link:hover{text-decoration:underline}
  .rpt .ai-engines{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:16px 22px;border-bottom:1px solid var(--line)}
  .rpt .ai-eng{background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:12px 8px;text-align:center}
  .rpt .ai-eng .eng-name{font-size:12px;font-weight:700;color:var(--ink-soft)}
  .rpt .ai-eng .eng-rank{font-family:'Frank Ruhl Libre',serif;font-weight:900;font-size:26px;line-height:1.1;margin-top:4px;color:var(--ink)}
  .rpt .ai-eng.on{background:linear-gradient(160deg,var(--teal-wash),#fff 70%);border-color:var(--teal)}
  .rpt .ai-eng.on .eng-rank{color:var(--teal-deep)}
  .rpt .ai-eng.off .eng-rank{color:var(--ink-faint);font-family:'Heebo',sans-serif;font-weight:600;font-size:12.5px;margin-top:9px}
  .rpt .ai-q{font-size:13px;color:var(--ink-soft);padding:14px 22px 0}
  .rpt .ai-q b{color:var(--ink)}
  .rpt .demand{padding:16px 22px 18px;border-bottom:1px solid var(--line)}
  .rpt .demand-head{font-size:12.5px;font-weight:700;color:var(--ink-soft);margin-bottom:10px}
  .rpt .demand-head b{color:var(--ink)}
  .rpt .spark{display:flex;align-items:flex-end;gap:3px;height:56px}
  .rpt .spark .bar{flex:1;background:linear-gradient(180deg,var(--teal-bright),var(--teal));border-radius:3px 3px 0 0;min-height:3px}
  .rpt .spark .bar.last{background:linear-gradient(180deg,var(--gold),var(--amber))}
  .rpt .spark-labels{display:flex;gap:3px;margin-top:5px}
  .rpt .spark-labels span{flex:1;text-align:center;font-size:9.5px;color:var(--ink-faint);line-height:1.2;overflow:hidden}
  @media (max-width:560px){.rpt .spark-labels span:nth-child(even){visibility:hidden}}
  .rpt .next{background:linear-gradient(135deg,var(--navy),var(--navy-2));color:#fff;border-radius:16px;padding:28px 28px;margin:46px 0 0;position:relative;overflow:hidden}
  .rpt .next::after{content:'';position:absolute;inset-inline-start:-60px;bottom:-60px;width:220px;height:220px;border-radius:50%;background:radial-gradient(circle,rgba(16,185,129,.18),transparent 65%)}
  .rpt .next h2{color:#fff;margin-bottom:8px;font-size:20px}
  .rpt .next p{color:#bcd2e2;font-size:14.5px;max-width:580px;position:relative;z-index:1}
  .rpt .next .date{margin-top:16px;font-size:13px;color:#93a9bb}
  .rpt .next .date b{color:#3fd0ba}
  .rpt footer{padding:36px 0 44px;text-align:center;color:var(--ink-faint);font-size:12.5px}
  .rpt footer a{color:var(--teal-deep);text-decoration:none;font-weight:700}
  .rpt .foot-brand{display:flex;justify-content:center;align-items:center;gap:8px;margin-bottom:8px;color:var(--ink-soft);font-weight:700;font-size:13px}
  @media (max-width:560px){.rpt .thesis p.big{font-size:23px}.rpt h1{font-size:23px}.rpt .metric .num{font-size:31px}.rpt .row-side{text-align:right;width:100%}.rpt .action{padding:16px}.rpt .action-num{display:none}}
`

const STAR_SVG = (
  <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
    <circle cx="13" cy="13" r="12" stroke="#2ea08f" strokeWidth="1.4" opacity=".45" />
    <circle cx="13" cy="13" r="7.5" stroke="#2ea08f" strokeWidth="1.2" opacity=".7" />
    <path d="M13 4.5 L14.6 11.4 L21.5 13 L14.6 14.6 L13 21.5 L11.4 14.6 L4.5 13 L11.4 11.4 Z" fill="#3fd0ba" />
  </svg>
)

const HE_MONTHS_SHORT = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ']

// Inline demand sparkline — no chart library. Bars read oldest→newest (dir=ltr),
// last month highlighted, with aligned Hebrew month labels (last bar = current
// month, counting backwards). Heights scale to the series max.
export function DemandSpark({ series }: { series: number[] }) {
  const bars = series.slice(-12)
  const max = Math.max(...bars, 1)
  const now = new Date()
  const labels = bars.map((_, i) => {
    const monthsAgo = bars.length - 1 - i
    const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1)
    return HE_MONTHS_SHORT[d.getMonth()]
  })
  return (
    <div dir="ltr">
      <div className="spark">
        {bars.map((v, i) => (
          <div
            key={i}
            className={`bar${i === bars.length - 1 ? ' last' : ''}`}
            style={{ height: `${Math.max(6, Math.round((v / max) * 100))}%` }}
            title={`${labels[i]}: ${v.toLocaleString('he-IL')}`}
          />
        ))}
      </div>
      <div className="spark-labels">
        {labels.map((m, i) => <span key={i}>{m}</span>)}
      </div>
    </div>
  )
}

export default function ReportView({ data: r, archive, example }: { data: ReportData; archive?: { label: string }; example?: { label: string } }) {
  return (
    <div className="rpt" dir="rtl">
      <link href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;500;700;900&family=Heebo:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      <style dangerouslySetInnerHTML={{ __html: REPORT_CSS }} />

      {/* HEADER */}
      <header>
        <div className="wrap">
          <div className="brand">
            {STAR_SVG}
            <span className="brand-name">NORTH STAR RADAR · מודיעין שוק לעסק שלך</span>
          </div>
          {archive && <div className="archive-badge">📁 דוח ארכיון{archive.label ? ` · ${archive.label}` : ''}</div>}
          {example && <div className="archive-badge">🧪 דוח לדוגמה — {example.label}</div>}
          <h1>הדוח השבועי של {r.companyName}</h1>
          <div className="report-meta">
            {r.scanDate && <span>סריקה מ־<b>{r.scanDate}</b></span>}
            {r.period && <span>תקופה: <b>{r.period}</b></span>}
            {r.area && <span>אזור פעילות: <b>{r.area}</b></span>}
          </div>
          {r.achievement && (
            <div className="achieve">
              <span className="medal">🏆</span>
              <div>
                <div className="a-title">{r.achievement.title}</div>
                <div className="a-sub">{r.achievement.sub}</div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* THESIS */}
      <div className="thesis">
        <div className="wrap">
          <p className="big" dangerouslySetInnerHTML={{ __html: r.thesis.big }} />
          {r.thesis.sub && <p className="sub">{r.thesis.sub}</p>}
        </div>
      </div>

      {/* METRICS */}
      {r.metrics.length > 0 && (
        <div className="metrics">
          <div className="wrap">
            <div className="metrics-grid">
              {r.metrics.map((m, i) => (
                <div className={`metric${m.hot ? ' hot' : ''}`} key={i}>
                  <div className="num">{m.num}</div>
                  {m.badge && <div><span className={`badge ${m.badge.kind}`}>{m.badge.text}</span></div>}
                  <div className="label" dangerouslySetInnerHTML={{ __html: m.label }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ACTIONS */}
      {r.actions.length > 0 && (
        <section>
          <div className="wrap">
            <div className="sec-head"><span className="sec-kicker">מה לעשות השבוע</span></div>
            <h2>{r.actions.length === 1 ? 'הפעולה של השבוע' : `${r.actions.length} פעולות, לפי סדר דחיפות`}</h2>
            <p className="sec-bottomline">כל המלצה מבוססת על <b>נתון שנמצא בסריקה</b> — המקור מצוין מתחתיה.</p>
            {r.actions.map((a, i) => (
              <div className={`action${a.kind ? ' ' + a.kind : ''}`} key={i}>
                <div className="action-num">{i + 1}</div>
                <div className="action-body">
                  <div className="action-title">{a.title}</div>
                  {a.why && <div className="action-why">{a.why}</div>}
                  {a.src && <div className="action-src">{a.src}</div>}
                </div>
                <span className={`chip ${a.chip.kind}`}>{a.chip.text}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* מעקב מתחרים — projection of the tracking module's stored data.
          Replaces the old "מה השתנה אצל המתחרים" change-detection section and
          its (now disabled) competitor-trends fallback. Read-only, zero AI. */}
      {r.competitorTracking && r.competitorTracking.length > 0 ? (
        <section>
          <div className="wrap">
            <div className="sec-head"><span className="sec-kicker">מתחרים</span></div>
            <h2>מעקב מתחרים</h2>
            <div className="card">
              {r.competitorTracking.map((c, i) => (
                <div className="trk" key={i}>
                  <div className="trk-head">
                    <span className="trk-name">{c.name}</span>
                    <span className="trk-links">
                      {c.links.map((l, j) => (
                        <a key={j} href={l.url} target="_blank" rel="noopener noreferrer">{l.label}</a>
                      ))}
                    </span>
                  </div>

                  {/* ⭐ + 👥 — the numbers that matter, rendered big. */}
                  {(c.reviews || c.followers.length > 0) && (
                    <div className="trk-nums">
                      {c.reviews && (
                        <div className="trk-num stars">
                          <div className="big">{c.reviews.rating != null ? `${c.reviews.rating}★` : '—'}</div>
                          <div className="cap">
                            {c.reviews.total != null
                              ? `${c.reviews.total.toLocaleString('he-IL')} ביקורות בגוגל`
                              : 'דירוג בגוגל'}
                          </div>
                        </div>
                      )}
                      {c.followers.map((f, j) => (
                        <div className="trk-num" key={j}>
                          <div className="big">{f.count.toLocaleString('he-IL')}</div>
                          <div className="cap">
                            עוקבים · {f.label}
                            {f.growth && <span className={f.growth.dir === 'up' ? ' ▲' : ' ▼'}>{` ${f.growth.text}`}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {c.reviews?.recent && <div className="trk-line">🆕 {c.reviews.recent}</div>}
                  {c.reviews?.sentiment && (
                    <div className={`trk-line ${c.reviews.sentiment.dir === 'up' ? 'up' : c.reviews.sentiment.dir === 'down' ? 'down' : ''}`}>
                      {c.reviews.sentiment.dir === 'up' ? '📈' : c.reviews.sentiment.dir === 'down' ? '📉' : '➖'} {c.reviews.sentiment.text}
                    </div>
                  )}

                  {c.posts.length > 0 && (
                    <>
                      <div className="trk-sub">📱 פרסומים אחרונים</div>
                      {c.posts.map((p, j) => (
                        <div className="trk-post" key={j}>
                          <div className="meta">{p.date}{p.date && ' · '}{p.platform}{p.engagement ? ` · ${p.engagement}` : ''}</div>
                          <div className="txt">{p.caption}</div>
                        </div>
                      ))}
                    </>
                  )}

                  {c.insights.length > 0 && (
                    <>
                      <div className="trk-sub">תובנות (45 יום)</div>
                      {c.insights.map((t, j) => <div className="trk-ins" key={j}>· {t}</div>)}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : r.competitorsNote ? (
        <section>
          <div className="wrap">
            <div className="sec-head"><span className="sec-kicker">מתחרים</span></div>
            <h2>מעקב מתחרים</h2>
            <div className="calm-note">{r.competitorsNote}</div>
          </div>
        </section>
      ) : null}

      {/* TENDERS */}
      {r.tenders.length > 0 && (
        <section>
          <div className="wrap">
            <div className="sec-head"><span className="sec-kicker">מכרזים</span></div>
            <h2>{r.tenders.length} מכרזים פתוחים רלוונטיים</h2>
            <div className="card">
              {r.tenders.map((t, i) => (
                <div className={`row${t.hot ? ' hot-row' : ''}`} key={i}>
                  <div className="row-main">
                    <div className="row-title">{t.title}{t.pill && <span className={`pill ${t.pill.kind}`}>{t.pill.text}</span>}</div>
                    {t.sub && <div className="row-sub">{t.sub}</div>}
                  </div>
                  <div className="row-side">{t.deadline ? <span className="deadline">{t.side}</span> : t.side}</div>
                </div>
              ))}
              <a className="more-link" href="/app/tenders">לכל המכרזים במערכת ←</a>
            </div>
          </div>
        </section>
      )}

      {/* PARTNERS / LEADS — word tags, verified links, no numeric scores */}
      {r.leadGroups.length > 0 && (
        <section>
          <div className="wrap">
            <div className="sec-head"><span className="sec-kicker">שותפים וערוצי הפצה</span></div>
            <h2>שותפים וערוצי הפצה פוטנציאליים</h2>
            <p className="sec-bottomline">לפי ערוצי ההפצה שהגדרת. כל האתרים אומתו ✓</p>
            <div className="card">
              {r.leadGroups.map((g, gi) => (
                <div key={gi}>
                  <div className="channel-tag">{g.channel}</div>
                  {g.leads.map((l, i) => (
                    <div className="row" key={i}>
                      <div className="row-main">
                        <div className="row-title">
                          {l.website
                            ? <a className="lead-link" href={l.website} target="_blank" rel="noopener noreferrer">{l.title}</a>
                            : l.title}
                          {l.matchTag && <span className="pill amber">{l.matchTag.text}</span>}
                        </div>
                        {l.sub && <div className="row-sub">{l.sub}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              <a className="more-link" href="/app/distribution-channels">לכל השותפים במערכת ←</a>
            </div>
          </div>
        </section>
      )}

      {/* SEO / GEO — focused: 1 primary keyword + 1 AI question (3 engines) + ≤3 expressions + demand */}
      {(r.seoPrimary || r.seoAi || r.seo.length > 0) && (
        <section>
          <div className="wrap">
            <div className="sec-head"><span className="sec-kicker">איך מוצאים אותך</span></div>
            <h2>הדירוג שלך בגוגל ובמנועי AI</h2>
            <div className="card">
              {(() => {
                // Unranked (not found in Google top 100) → a calm muted label, not a bare dash.
                const rankCell = (row: { rank: string; warn?: boolean; unranked?: boolean }) =>
                  row.unranked
                    ? <div className="rank-unranked">לא מדורג<br />עדיין</div>
                    : <div className={`rank-num${row.warn ? ' warn' : ''}`}>{row.rank}</div>

                const googleBlock = (
                  <>
                    {/* Primary Google keyword */}
                    {r.seoPrimary && (
                      <div className="rank-row">
                        {rankCell(r.seoPrimary)}
                        <div className="rank-main">
                          <div className="rank-title">{r.seoPrimary.query}</div>
                          <div className="rank-sub">{r.seoPrimary.sub}</div>
                        </div>
                      </div>
                    )}
                    {/* Demand sparkline for the primary keyword */}
                    {r.demand && r.demand.series.length >= 3 && (
                      <div className="demand">
                        <div className="demand-head"><b>{r.demand.label}</b> · "{r.demand.keyword}"</div>
                        <DemandSpark series={r.demand.series} />
                      </div>
                    )}
                    {/* Up to 2 more expressions (total ≤ 3) */}
                    {(r.seoExtras || []).map((s, i) => (
                      <div className="rank-row" key={i}>
                        {rankCell(s)}
                        <div className="rank-main">
                          <div className="rank-title">{s.query}</div>
                          <div className="rank-sub">{s.sub}</div>
                        </div>
                      </div>
                    ))}
                  </>
                )

                // Up to 3 GEO questions, each with per-engine positions (mirrors the
                // SEO expressions). Falls back to the single seoAi for old snapshots.
                const aiQs = (r.seoAiQuestions && r.seoAiQuestions.length > 0)
                  ? r.seoAiQuestions
                  : (r.seoAi ? [r.seoAi] : [])
                const aiBlock = aiQs.length > 0 ? (
                  <>
                    {aiQs.slice(0, 3).map((q, qi) => (
                      <div key={`aiq-${qi}`}>
                        <div className="ai-q">{qi === 0 ? 'שאלה במנועי AI: ' : ''}<b>"{q.question}"</b></div>
                        <div className="ai-engines">
                          {q.engines.map((e, i) => (
                            <div className={`ai-eng ${e.appeared ? 'on' : 'off'}`} key={i}>
                              <div className="eng-name">{e.name}</div>
                              <div className="eng-rank">{e.rank}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </>
                ) : null

                // AI-first when the client has no Google rank but shows in AI engines.
                return r.seoAiFirst
                  ? <>{aiBlock}{googleBlock}</>
                  : <>{googleBlock}{aiBlock}</>
              })()}

              {/* Legacy fallback for older snapshots (no focused fields) */}
              {!r.seoPrimary && !r.seoAi && r.seo.map((s, i) => (
                <div className="rank-row" key={`legacy-${i}`}>
                  <div className={`rank-num${s.warn ? ' warn' : ''}`}>{s.rank}</div>
                  <div className="rank-main">
                    <div className="rank-title">{s.title}</div>
                    <div className="rank-sub">{s.sub}</div>
                  </div>
                  {s.badge && <span className={`badge ${s.badge.kind}`}>{s.badge.text}</span>}
                </div>
              ))}

              <a className="more-link" href="/app/seo-geo">לדוח הדירוג המלא במערכת ←</a>
            </div>
          </div>
        </section>
      )}

      {/* TRENDS — keyword trends + industry hot trends (stored, with real sources) */}
      {(r.trends.length > 0 || (r.industryTrends && r.industryTrends.length > 0)) && (
        <section>
          <div className="wrap">
            <div className="sec-head"><span className="sec-kicker">טרנדים ומילות מפתח</span></div>
            <h2>מה עולה בשוק שלך</h2>
            <div className="card">
              {r.trends.map((t, i) => (
                <div className={`row${t.hot ? ' hot-row' : ''}`} key={i}>
                  <div className="row-main">
                    <div className="row-title">{t.title}{t.hot && <span className="pill amber">🔥 חם</span>}</div>
                    {t.sub && <div className="row-sub">{t.sub}</div>}
                  </div>
                  <div className="row-side"><span className={`badge ${t.badge.kind}`}>{t.badge.text}</span></div>
                </div>
              ))}
              {/* Industry hot trends — source link only when a REAL captured URL exists */}
              {(r.industryTrends || []).length > 0 && (
                <>
                  <div className="channel-tag">טרנדים חמים בתחום</div>
                  {r.industryTrends!.map((t, i) => (
                    <div className="row" key={`it-${i}`}>
                      <div className="row-main">
                        <div className="row-title">
                          {t.title}
                          {t.sourceUrl && (
                            <>{' '}<a className="src-link" href={t.sourceUrl} target="_blank" rel="noopener noreferrer">מקור ←</a></>
                          )}
                        </div>
                      </div>
                      <div className="row-side"><span className={`badge ${t.badge.kind}`}>{t.badge.text}</span></div>
                    </div>
                  ))}
                </>
              )}
              <a className="more-link" href="/app/trends">לניתוח הטרנדים המלא ←</a>
            </div>
          </div>
        </section>
      )}

      {/* CONFERENCES */}
      {r.conferences.length > 0 && (
        <section>
          <div className="wrap">
            <div className="sec-head"><span className="sec-kicker">כנסים ואירועים</span></div>
            <h2>{r.conferences.length} אירועים ששווים את הזמן שלך</h2>
            <div className="card">
              {r.conferences.map((c, i) => (
                <div className="row" key={i}>
                  <div className="row-main">
                    <div className="row-title">{c.title}{c.pill && <span className="pill teal">{c.pill}</span>}</div>
                    {c.sub && <div className="row-sub">{c.sub}</div>}
                  </div>
                  <div className="row-side">{c.side}</div>
                </div>
              ))}
              <a className="more-link" href="/app/conferences">לכל הכנסים במערכת ←</a>
            </div>
          </div>
        </section>
      )}

      {/* NEWS */}
      {r.news.length > 0 && (
        <section>
          <div className="wrap">
            <div className="sec-head"><span className="sec-kicker">חדשות רלוונטיות</span></div>
            <h2>ידיעות ששוות דקה</h2>
            <div className="card">
              {r.news.map((n, i) => (
                <div className="row" key={i}>
                  <div className="row-main">
                    <div className="row-title">{n.title}{n.pill && <span className="pill amber">{n.pill}</span>}</div>
                    {n.sub && <div className="row-sub">{n.sub}</div>}
                  </div>
                </div>
              ))}
              <a className="more-link" href="/app/news">לכל החדשות במערכת ←</a>
            </div>
          </div>
        </section>
      )}

      {/* NEXT SCAN — hidden on archive views (historical) */}
      {!archive && r.nextScan && (
        <section>
          <div className="wrap">
            <div className="next">
              <h2>מה בסריקה הבאה</h2>
              <p>נמשיך לעקוב אחרי הדירוג, המתחרים, המכרזים והשותפים — והדוח המעודכן יגיע אליך אוטומטית.</p>
              <div className="date">הסריקה הבאה: <b>{r.nextScan}</b> · הדוח יגיע אליך אוטומטית</div>
            </div>
          </div>
        </section>
      )}

      <footer>
        <div className="wrap">
          <div className="foot-brand">
            <svg width="16" height="16" viewBox="0 0 26 26" fill="none" aria-hidden="true">
              <circle cx="13" cy="13" r="12" stroke="#0d9488" strokeWidth="1.6" opacity=".4" />
              <path d="M13 4.5 L14.6 11.4 L21.5 13 L14.6 14.6 L13 21.5 L11.4 14.6 L4.5 13 L11.4 11.4 Z" fill="#0d9488" />
            </svg>
            North Star Radar
          </div>
          {r.scanDate ? `הדוח הופק אוטומטית מסריקת השוק של ${r.scanDate} · ` : ''}
          <a href="/login">לכניסה למערכת</a>
        </div>
      </footer>
    </div>
  )
}
