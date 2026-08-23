// Read-only assembly of a company's PUBLIC web report from the LATEST stored
// scan results. NO AI calls, NO generation — pure deterministic reading of what
// the scan already produced. Missing modules → the field is empty and the page
// hides that section.
//
// Admin-hidden items (admin_hidden_items) are filtered out here so they never
// appear in the client web report OR in snapshots (snapshots reuse this fn).

import { loadHiddenKeys, filterHidden } from '@/lib/admin/hidden'
import { norm } from '@/lib/match/hebrew-core'
import { deriveArea } from '@/lib/geo/area'
import { readGeoQuestions } from '@/lib/geo/read'
import { filterUpcomingConferences, conferenceDateLabel, parseConferenceDate } from '@/lib/conferences/date'
import { TENDERS_ENABLED, COMPETITOR_TRENDS_ENABLED } from '@/lib/flags'
import {
  PLATFORM_LABELS as SHARED_LABELS, recentPostsFrom, notablePostsFrom,
  engagementLabel, googleListingUrl, type DisplayPost,
} from '@/lib/competitor-intel/display'

const FIELD_SEP = '␟'

// STEP 7 — Meta/social placeholder (feature-flagged, OFF). When Meta/social
// change data exists (new post / campaign / viral), flip this on and populate
// competitor social deltas below. Nothing is rendered while false.
const SOCIAL_TAGS_ENABLED = false

function parseConfDesc(description: string): { score: number | null; text: string } {
  const m = (description || '').match(/^\[rel:(\d+)\]([\s\S]*?)␟([\s\S]*)$/)
  if (!m) return { score: null, text: description || '' }
  return { score: parseInt(m[1], 10), text: m[3] || '' }
}
function stripSrc(description: string): string {
  return (description || '').replace(/^\[src:[^\]]*\]/, '').trim()
}

function heDate(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch { return '' }
}
function heDay(iso: string | null | undefined): string {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' }) } catch { return '' }
}

export interface ReportData {
  companyName: string
  scanDate: string       // Hebrew
  period: string         // "X–Y month"
  area: string
  nextScan: string       // Hebrew
  achievement: { title: string; sub: string } | null
  thesis: { big: string; sub: string }
  metrics: Array<{ num: string; badge?: { kind: 'up' | 'down' | 'flat' | 'new'; text: string }; label: string; hot?: boolean }>
  actions: Array<{ title: string; why: string; src: string; chip: { kind: 'urgent' | 'watch' | 'go'; text: string }; kind: 'urgent' | 'watch' | '' }>
  competitors: Array<{ name: string; sub: string; deltas: Array<{ kind: 'good' | 'bad' | 'neutral'; text: string }>; hot?: boolean }>
  competitorsNote?: string | null   // calm line / intro when no competitor changed this scan
  /**
   * "מעקב מתחרים" — the tracking module's stored view, read-only. Replaces the
   * old change-detection section. Everything here comes from competitor_tracking
   * rows; nothing is generated at report time.
   */
  competitorTracking?: Array<{
    name: string
    links: Array<{ label: string; url: string }>
    reviews?: {
      rating: number | null
      total: number | null
      headline: string          // the BIG highlighted line
      recent?: string           // new reviews in the window
      sentiment?: { dir: 'up' | 'down' | 'flat'; text: string }
    }
    followers: Array<{ label: string; count: number; growth?: { dir: 'up' | 'down'; text: string } }>
    /** Clickable Google listing, built from the cid resolved during tracking. */
    googleUrl?: string
    posts: Array<{
      date: string
      platform: string          // key, for the badge colour
      platformLabel: string     // prominent label
      caption: string
      engagement?: string       // explicit "👍 N · 💬 N", never a merged total
      url?: string
      notable?: boolean
    }>
    insights: string[]
    /** Meaningful website changes since the previous scan (empty → hidden). */
    websiteChanges?: Array<{ icon: string; text: string; soWhat?: string }>
    scannedAt?: string
  }>
  // Evergreen filler when no changes this scan: top stored competitor-trends,
  // each with an optional amber "opportunity-for-you" line.
  competitorTrends?: Array<{ name: string; topic: string; opportunity?: string; sourceUrl?: string }>
  // Industry hot trends (stored industry_trends) — read-only, with real source links.
  industryTrends?: Array<{ title: string; badge: { kind: 'up' | 'down' | 'flat'; text: string }; sourceUrl?: string }>
  tenders: Array<{ title: string; sub: string; side: string; pill?: { kind: 'teal' | 'amber'; text: string }; hot?: boolean; deadline?: boolean }>
  leadGroups: Array<{ channel: string; leads: Array<{ title: string; sub: string; matchTag?: { kind: 'high' | 'good'; text: string }; website?: string; score?: number; hot?: boolean }> }>
  // Legacy flat list — kept so older snapshots still render. New reports populate
  // the focused fields below and leave this empty.
  seo: Array<{ rank: string; title: string; sub: string; badge?: { kind: 'up' | 'down' | 'flat'; text: string }; warn?: boolean }>
  seoPrimary?: { query: string; rank: string; sub: string; warn?: boolean; unranked?: boolean } | null
  seoAi?: { question: string; engines: Array<{ name: string; rank: string; appeared: boolean }> } | null
  // Up to 3 GEO questions, each with the client's position per engine — mirrors
  // the SEO section's 3 expressions. seoAi (above) stays = the first, for old snapshots.
  seoAiQuestions?: Array<{ question: string; engines: Array<{ name: string; rank: string; appeared: boolean }> }>
  seoExtras?: Array<{ query: string; rank: string; sub: string; warn?: boolean; unranked?: boolean }>
  seoAiFirst?: boolean   // lead with the AI block when the client has no Google rank but shows in AI
  demand?: { keyword: string; series: number[]; label: string } | null
  trends: Array<{ title: string; sub: string; badge: { kind: 'up' | 'down' | 'flat'; text: string }; hot?: boolean }>
  conferences: Array<{ title: string; sub: string; side: string; pill?: string }>
  news: Array<{ title: string; sub: string; pill?: string }>
}

const num = (v: any): number | null => (typeof v === 'number' && isFinite(v) ? v : null)

export async function assembleReport(db: any, companyId: string, company: any): Promise<ReportData> {
  const bp = (company?.business_profile ?? {}) as any
  // Single source of truth for the "אזור פעילות" label (from geographic_scope).
  const area = deriveArea(company, bp).display
  const today = new Date().toISOString().split('T')[0]

  const [[{ data: competitorsRaw }, { data: tendersRaw }, { data: leadsRaw }, { data: conferencesRaw }, { data: newsRaw }, { data: trackingRaw }], hiddenKeys] =
    await Promise.all([
      Promise.all([
        db.from('competitors').select('name, website, threat_score, positioning, trend, services, google_rating, google_review_count').eq('company_id', companyId),
        db.from('tenders').select('title, organization, deadline, budget, link, relevance_score, description, created_at').eq('company_id', companyId),
        db.from('leads').select('name, website, industry, reason, score, source, location').eq('company_id', companyId),
        db.from('conferences').select('name, date, location, description, url, category').eq('company_id', companyId),
        db.from('news').select('title, source, url, summary, category, published_at').eq('company_id', companyId).order('published_at', { ascending: false }),
        // NEW competitor module. Fetched HERE on purpose: snapshot.ts calls
        // assembleReport, so the live /r/[token] read and the frozen archive
        // both get it from one place — the missing-SELECT trap this report has
        // hit repeatedly cannot reopen for two separate query sites.
        db.from('competitor_tracking')
          .select('competitor_name, resolved_links, sources, insights, reviews, website, scanned_at')
          .eq('company_id', companyId)
          .order('competitor_name'),
      ]),
      loadHiddenKeys(companyId, undefined, db),
    ])

  // ── Competitor tracking stats (early: the headline + metric strip need them) ─
  // Pure counting over stored competitor_tracking rows — no fetching, no AI.
  const TRACK_WEEK_DAYS = 7
  const weekCutoff = Date.now() - TRACK_WEEK_DAYS * 86400000
  const trackedRows: any[] = Array.isArray(trackingRaw) ? trackingRaw : []
  const trackStats = trackedRows.map((row: any) => {
    const srcs: any[] = Array.isArray(row?.sources) ? row.sources : []
    const posts = srcs.flatMap((sc: any) =>
      (Array.isArray(sc?.posts) ? sc.posts : []).map((p: any) => ({ ...p, source: sc.source })))
    const weekPosts = posts.filter((p: any) => {
      const t = p?.date ? new Date(p.date).getTime() : NaN
      return !isNaN(t) && t >= weekCutoff   // undated posts never counted as "this week"
    })
    const rv = (row?.reviews || {}) as any
    const negatives = Array.isArray(rv?.insights?.negatives) ? rv.insights.negatives : []
    const bestPost = posts
      .filter((p: any) => (p?.likes ?? 0) + (p?.comments ?? 0) > 0)
      .sort((a: any, b: any) => ((b.likes ?? 0) + (b.comments ?? 0)) - ((a.likes ?? 0) + (a.comments ?? 0)))[0]
    const wchanges = (Array.isArray(row?.website?.changes) ? row.website.changes : [])
      .filter((c: any) => c && String(c.text || '').trim())
    return {
      name: String(row?.competitor_name || '').trim(),
      websiteChanges: wchanges,
      weekPosts: weekPosts.length,
      negatives,
      newReviews: rv?.insights?.recent?.count ?? 0,
      sentimentDown: rv?.insights?.sentiment?.direction === 'down',
      bestPost: bestPost
        ? { engagement: (bestPost.likes ?? 0) + (bestPost.comments ?? 0), caption: String(bestPost.caption || '').slice(0, 80) }
        : null,
      // Must match the filter on competitorTracking below, or the card would
      // claim more competitors than the section actually shows. A row that was
      // scanned but yielded nothing is not "under tracking" from the client's
      // point of view — there is nothing to look at.
      hasData: !!(rv?.found || posts.length || (row?.insights && Object.keys(row.insights).length > 0)),
    }
  }).filter((t: any) => t.name && t.hasData)
  const trackedCount = trackStats.length
  const trackedWeekPosts = trackStats.reduce((n: number, t: any) => n + t.weekPosts, 0)

  // Drop admin-hidden items before anything is computed/shown.
  const competitors = filterHidden(competitorsRaw as any[], 'competitor', hiddenKeys, (c: any) => c.name)
  // Tenders module feature-flagged off → empty everywhere downstream (section,
  // metric, achievement, opportunity count). Old snapshots keep their frozen data.
  const tenders = TENDERS_ENABLED
    ? filterHidden(tendersRaw as any[], 'tender', hiddenKeys, (t: any) => t.title)
    : []
  const leads = filterHidden(leadsRaw as any[], 'lead', hiddenKeys, (l: any) => l.name)
  const conferences = filterHidden(conferencesRaw as any[], 'conference', hiddenKeys, (c: any) => c.name)
  const news = filterHidden(newsRaw as any[], 'news', hiddenKeys, (n: any) => n.title)

  // ── SEO ────────────────────────────────────────────────────────────────────
  const seoRanking = (company?.seo_ranking ?? null) as any
  const seoVariants: any[] = Array.isArray(seoRanking?.queryVariants) ? seoRanking.queryVariants : []
  const appearedSeo = seoVariants.filter((v) => v.appeared && num(v.position) != null)
  const avgSeoPos = appearedSeo.length
    ? Math.round(appearedSeo.reduce((s, v) => s + (v.position as number), 0) / appearedSeo.length)
    : null

  // ── GEO ────────────────────────────────────────────────────────────────────
  const geoRanking = (company?.geo_ranking ?? null) as any
  let geoPos: number | null = num(geoRanking?.userPosition)
  if (geoPos == null && geoRanking?.engines) {
    const positions = ['chatgpt', 'gemini', 'grok']
      .map((k) => geoRanking.engines[k])
      .filter((e: any) => e?.appeared && num(e?.position) != null)
      .map((e: any) => e.position as number)
    if (positions.length) geoPos = Math.min(...positions)
  }

  // ── Trends (real changePct from keyword_trends) ─────────────────────────────
  const ktMap = (company?.keyword_trends ?? {}) as Record<string, any>
  const trendEntries = filterHidden(
    Object.values(ktMap).filter((k: any) => k && typeof k.searchVolume === 'number'),
    'trend', hiddenKeys, (k: any) => k.keyword || '',
  ).sort((a: any, b: any) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0))

  // ── Tenders (open, by match) ────────────────────────────────────────────────
  const openTenders = (tenders || [])
    .filter((t: any) => !t.deadline || t.deadline >= today)
    .sort((a: any, b: any) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0))

  // ── Leads grouped by source channel ─────────────────────────────────────────
  const leadsSorted = (leads || []).slice().sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0))

  // ── Conferences (upcoming, verified) ────────────────────────────────────────
  // Shared past/future decision (free-text dates + staleness between scans).
  const upcomingConfs = filterUpcomingConferences(conferences || [])
    .sort((a: any, b: any) => parseConfDesc(b.description).score! - parseConfDesc(a.description).score! || 0)

  // ── Weekly actions ──────────────────────────────────────────────────────────
  // Actions are a SNAPSHOT from scan time, so a since-hidden item (e.g. a hidden
  // Haifa tender) can still sit in them. Filter out any action whose text
  // references a hidden item's normalized key — conservative substring match on
  // the action's title+summary+signals (better to drop a real match than to show
  // a recommendation for a hidden item). Applies to live report AND snapshots.
  const waAll: any[] = Array.isArray(company?.weekly_actions?.actions) ? company.weekly_actions.actions : []
  const hiddenKeyList = [...hiddenKeys]
    .map((k) => k.split(FIELD_SEP)[1] || '')
    .filter((k) => k.length >= 4) // avoid trivial/over-broad matches
  const actionRefsHidden = (a: any): boolean => {
    if (!hiddenKeyList.length) return false
    const text = norm([
      a?.title, a?.summary, a?.details,
      ...(Array.isArray(a?.signals) ? a.signals.map((s: any) => s?.label) : []),
    ].filter(Boolean).join(' '))
    return hiddenKeyList.some((hk) => text.includes(hk))
  }
  // Tenders off → stored tender recommendations also drop out of the report.
  const waActions = waAll
    .filter((a) => !actionRefsHidden(a))
    .filter((a) => TENDERS_ENABLED || a?.category !== 'מכרז')
  const sortedActions = [
    ...waActions.filter((a) => a.priority === 'גבוהה'),
    ...waActions.filter((a) => a.priority !== 'גבוהה'),
  ].slice(0, 5)

  // ── Candidate business/rank facts (ordered by notability) ───────────────────
  // ONE shared list: the achievement banner takes the top fact; the thesis
  // business sentence draws from the REMAINDER so no fact is stated twice.
  const topSeo = appearedSeo.filter((v) => (v.position as number) <= 3).sort((a, b) => a.position - b.position)[0]
  const bestTender = openTenders[0]
  const topLead = leadsSorted[0]

  type Fact = { id: string; title: string; sub: string; sentence: string }
  const facts: Fact[] = []
  if (topSeo) facts.push({
    id: 'seo-top3', title: 'הישג השבוע: אתה בטופ 3 בגוגל', sub: `"${topSeo.query}" — מקום #${topSeo.position} בתוצאות`,
    sentence: `הדירוג שלך בגוגל חזק — מקום #${topSeo.position} על "${topSeo.query}"`,
  })
  if (geoPos != null && geoPos <= 3) facts.push({
    id: 'geo-top3', title: 'הישג השבוע: מומלץ במנועי AI', sub: `העסק שלך מופיע במקום #${geoPos} בהמלצות ChatGPT/Gemini`,
    sentence: `אתה מופיע במקום #${geoPos} בהמלצות מנועי ה־AI`,
  })
  if (bestTender && (bestTender.relevance_score ?? 0) >= 85) facts.push({
    id: 'tender', title: 'הישג השבוע: מכרז בהתאמה גבוהה', sub: `"${bestTender.title}" — התאמה ${bestTender.relevance_score}%`,
    sentence: `נמצא מכרז בהתאמה גבוהה (${bestTender.relevance_score}%)`,
  })
  if (topLead && (topLead.score ?? 0) >= 80) facts.push({
    id: 'lead', title: 'הישג השבוע: שותף מוביל זוהה', sub: `${topLead.name} — התאמה גבוהה`,
    sentence: `זוהה שותף פוטנציאלי מוביל — ${topLead.name}`,
  })
  // Non-banner fact (used only for the thesis sentence, never the medal).
  if (avgSeoPos != null) facts.push({
    id: 'seo-avg', title: '', sub: '',
    sentence: `המיקום הממוצע שלך בגוגל הוא ${avgSeoPos}`,
  })

  // Achievement = the top BANNER-worthy fact (not the plain avg-position one).
  const bannerFact = facts.find((f) => f.title)
  const achievement: ReportData['achievement'] = bannerFact
    ? { title: bannerFact.title, sub: bannerFact.sub }
    : null

  // ── Thesis: TWO deterministic context sentences ─────────────────────────────
  const newOppCount = openTenders.length + leadsSorted.length // new tenders + leads this scan

  // (1) Market-level — from keyword_trends. Prefer a real rising/falling signal.
  const movingKw = trendEntries.find((k: any) =>
    (k.direction === 'rising' || k.direction === 'falling') && !k.lowData && num(k.changePct) != null && Math.abs(k.changePct) >= 3)
  const topVolKw = trendEntries[0]
  let marketSentence = ''
  if (movingKw) {
    const verb = movingKw.direction === 'rising' ? 'עלה' : 'ירד'
    marketSentence = `הביקוש ל<em>"${movingKw.keyword}"</em> ${verb} ב־${Math.abs(movingKw.changePct)}% מהרבעון הקודם`
  } else if (topVolKw && num(topVolKw.searchVolume)) {
    marketSentence = `הביקוש ל<em>"${topVolKw.keyword}"</em> יציב סביב ${(topVolKw.searchVolume).toLocaleString('he-IL')} חיפושים בחודש`
  }

  // (2) Business-level — rank/GEO trend + count of new opportunities. Uses the
  // NEXT notable fact (skips whatever the achievement already claimed).
  const remainderFacts = facts.filter((f) => f.id !== bannerFact?.id)
  const rankPhrase = remainderFacts[0]?.sentence
    || (avgSeoPos != null ? `המיקום הממוצע שלך בגוגל הוא ${avgSeoPos}` : 'הדירוג שלך יציב')
  const oppClause = newOppCount > 0 ? `${newOppCount} הזדמנויות חדשות זוהו השבוע` : ''
  // Competitor activity joins the opening summary — only when there is real
  // activity to report, so a quiet week says nothing rather than "0 פוסטים".
  const competitorSentence = trackedCount > 0 && trackedWeekPosts > 0
    ? `${trackedCount === 1 ? 'המתחרה שלך פרסם' : `${trackedCount} המתחרים שלך פרסמו`} <em>${trackedWeekPosts}</em> ${trackedWeekPosts === 1 ? 'פוסט' : 'פוסטים'} השבוע`
    : ''

  /**
   * The summary is a row of INDEPENDENT stats, so they're separated by a pipe
   * rather than commas and periods. Mixed Hebrew / English / numbers made the
   * old joining read as one run-on sentence ("…מנועי ה־AI, 10 הזדמנויות…").
   *
   * Each segment is wrapped in its own bidi isolate: without it the pipe and a
   * segment that STARTS with a digit or "#" reorder across the RTL/LTR boundary
   * and the separator visually jumps between the wrong stats.
   */
  const SUMMARY_SEP = '<span class="sep">|</span>'
  const joinSegments = (segs: string[]) =>
    segs.filter(Boolean).map((t) => `<span class="seg">${t}</span>`).join(SUMMARY_SEP)

  const summarySegments = [rankPhrase, oppClause, competitorSentence].filter(Boolean)

  // Assemble: the big serif line is the market headline (or the first stat when
  // there is no market signal); the sub line carries the remaining stats.
  const thesisBig = marketSentence || summarySegments[0] || ''
  const thesisSub = joinSegments(marketSentence ? summarySegments : summarySegments.slice(1))

  // ── Metrics strip ───────────────────────────────────────────────────────────
  const metrics: ReportData['metrics'] = []
  if (avgSeoPos != null) metrics.push({ num: String(avgSeoPos), label: `מיקום ממוצע בגוגל<br>(${appearedSeo.length} מילות מפתח)`, hot: avgSeoPos <= 5 })
  if (geoPos != null) metrics.push({ num: `#${geoPos}`, label: 'מיקום בהמלצות AI<br>(ChatGPT, Gemini)', hot: geoPos <= 3 })
  if (openTenders.length) metrics.push({ num: String(openTenders.length), label: 'מכרזים רלוונטיים<br>פתוחים כרגע' })
  if (leadsSorted.length) metrics.push({ num: String(leadsSorted.length), label: 'שותפים פוטנציאליים<br>שזוהו' })
  if (upcomingConfs.length) metrics.push({ num: String(upcomingConfs.length), label: 'כנסים רלוונטיים<br>קרובים' })
  // Competitors: TWO numbers in one card — how many are tracked, and how much
  // they published this week. Hidden entirely when nothing is tracked.
  if (trackedCount > 0) {
    metrics.push({
      num: String(trackedCount),
      label: trackedWeekPosts > 0
        ? `מתחרים במעקב<br><b>${trackedWeekPosts}</b> פוסטים השבוע`
        : 'מתחרים במעקב<br>ללא פרסומים השבוע',
      hot: trackedWeekPosts >= 10,
    })
  }

  // ── Actions ─────────────────────────────────────────────────────────────────
  // STEP 3 traffic-light discipline: RED (urgent) ONLY for real near-deadline
  // items (tender / conference). Everything else is a growth opportunity → AMBER
  // ("הזדמנות" for leads, "נקודה למחשבה" otherwise). Never red for non-deadlines.
  // ── Competitor actions (deterministic, from stored tracking) ──────────────
  // Built in code, never generated: same traffic-light discipline as the rest —
  // competitor activity is an OPPORTUNITY (amber "נקודה למחשבה"), never red.
  // Red stays reserved for real deadlines. Capped so they can't flood the list.
  const COMPETITOR_ACTION_CAP = 3
  const HIGH_POST_COUNT = Number(process.env.REPORT_COMPETITOR_BUSY_POSTS) || 4
  const HIGH_ENGAGEMENT = Number(process.env.REPORT_COMPETITOR_HOT_ENGAGEMENT) || 100
  const MODULE_SRC = 'מקור: מעקב מתחרים'
  type Act = ReportData['actions'][number]
  const competitorActions: Array<Act & { weight: number }> = []
  for (const t of trackStats) {
    // A website change is the strongest competitor signal there is: it means
    // they actually DID something — launched, repriced, repositioned.
    if (t.websiteChanges.length > 0) {
      const c = t.websiteChanges[0]
      const kindLabel: Record<string, string> = {
        price: 'שינה מחיר', product: 'השיק שירות חדש', promotion: 'פתח מבצע',
        positioning: 'שינה את המסר השיווקי', location: 'עדכן פרטי סניף',
      }
      const what = kindLabel[String(c.kind)] || 'עדכן את האתר'
      competitorActions.push({
        weight: 4,
        title: `${t.name} ${what}`,
        why: `${String(c.text).slice(0, 160)}${c.soWhat ? ` — ${String(c.soWhat).slice(0, 120)}` : ''}`,
        src: MODULE_SRC,
        chip: { kind: 'watch' as const, text: 'שינוי אצל מתחרה' },
        kind: 'watch' as const,
      })
    }
    // A fresh negative review is the strongest opening for the client.
    if (t.negatives.length > 0) {
      const ng = t.negatives[0]
      competitorActions.push({
        weight: 3,
        title: `${t.name} קיבל ביקורת שלילית`,
        why: `${ng.rating != null ? `${ng.rating}★ — ` : ''}${(ng.text || '').slice(0, 120)}${(ng.text || '').length > 120 ? '…' : ''} — הזדמנות לפנות ללקוחות שלא קיבלו מענה טוב`,
        src: MODULE_SRC,
        chip: { kind: 'watch' as const, text: 'הזדמנות' },
        kind: 'watch' as const,
      })
    }
    // A post that clearly outperformed — worth learning from.
    if (t.bestPost && t.bestPost.engagement >= HIGH_ENGAGEMENT) {
      competitorActions.push({
        weight: 2,
        title: `פוסט של ${t.name} קיבל תגובות רבות`,
        why: `${t.bestPost.engagement.toLocaleString('he-IL')} לייקים ותגובות${t.bestPost.caption ? ` — "${t.bestPost.caption}"` : ''}. שווה לראות מה עבד שם.`,
        src: MODULE_SRC,
        chip: { kind: 'watch' as const, text: 'נקודה למחשבה' },
        kind: 'watch' as const,
      })
    }
    // A busy week for a competitor — check what they're pushing.
    if (t.weekPosts >= HIGH_POST_COUNT) {
      competitorActions.push({
        weight: 1,
        title: `${t.name} פרסם ${t.weekPosts} פוסטים השבוע`,
        why: 'קצב פרסום גבוה מהרגיל — כדאי לבדוק מה הם מקדמים כרגע.',
        src: MODULE_SRC,
        chip: { kind: 'watch' as const, text: 'נקודה למחשבה' },
        kind: 'watch' as const,
      })
    }
  }
  // Most meaningful first, one action per competitor so a single busy
  // competitor can't take the whole list.
  const seenCompetitor = new Set<string>()
  const topCompetitorActions: Act[] = competitorActions
    .sort((a, b) => b.weight - a.weight)
    .filter((a) => {
      const who = trackStats.find((t: any) => a.title.includes(t.name))?.name || a.title
      if (seenCompetitor.has(who)) return false
      seenCompetitor.add(who)
      return true
    })
    .slice(0, COMPETITOR_ACTION_CAP)
    .map(({ weight, ...a }) => a)

  const storedActions: ReportData['actions'] = sortedActions.map((a) => {
    const sig = Array.isArray(a.signals) && a.signals[0] ? a.signals[0] : null
    const srcLabel = sig?.label ? `מקור: ${sig.label}` : (a.category ? `מקור: ${a.category}` : '')
    const isDeadline = a.category === 'מכרז' || a.category === 'כנס'
    if (isDeadline) {
      return {
        title: a.title || '', why: a.summary || a.details || '', src: srcLabel,
        chip: { kind: 'urgent' as const, text: a.category === 'כנס' ? 'מועד קרוב' : 'דדליין' },
        kind: 'urgent' as const,
      }
    }
    const chip = a.category === 'ליד'
      ? { kind: 'watch' as const, text: 'הזדמנות' }
      : { kind: 'watch' as const, text: 'נקודה למחשבה' }
    return { title: a.title || '', why: a.summary || a.details || '', src: srcLabel, chip, kind: 'watch' as const }
  })

  // Competitor actions sit HIGH — above the stored recommendations — but real
  // deadlines (מכרז/כנס) keep their place at the very top, since those expire.
  const deadlineActions = storedActions.filter((a) => a.kind === 'urgent')
  const otherStored = storedActions.filter((a) => a.kind !== 'urgent')
  const actions: ReportData['actions'] = [...deadlineActions, ...topCompetitorActions, ...otherStored].slice(0, 6)

  // ── Competitors: CHANGES ONLY ───────────────────────────────────────────────
  // STEP 4: show only competitors with a real change this scan (directional
  // movement / rating). Stable ones ("ללא שינוי מהותי") are dropped. If none
  // changed, a single calm line replaces the list.
  const allComp = (competitors || [])
    .slice()
    .sort((a: any, b: any) => (b.threat_score ?? 0) - (a.threat_score ?? 0))
  const changedComp = allComp.filter((c: any) => c.trend === 'growing' || c.trend === 'declining')
  const competitorsOut: ReportData['competitors'] = changedComp.slice(0, 3).map((c: any, i: number) => {
    const deltas: ReportData['competitors'][number]['deltas'] = []
    if (c.trend === 'growing') deltas.push({ kind: 'bad', text: 'במגמת עלייה ▲' })
    else if (c.trend === 'declining') deltas.push({ kind: 'good', text: 'במגמת ירידה ▼' })
    if (c.google_rating) deltas.push({ kind: 'neutral', text: `${c.google_rating}★${c.google_review_count ? ` (${c.google_review_count})` : ''}` })

    // STEP 7 — social/Meta change tags (feature-flagged OFF; nothing added while
    // SOCIAL_TAGS_ENABLED is false). Seam for when Meta data lands: e.g.
    //   if (SOCIAL_TAGS_ENABLED && c.social?.newCampaign) deltas.push({ kind: 'bad', text: 'קמפיין חדש בפייסבוק' })
    if (SOCIAL_TAGS_ENABLED) { /* populate social deltas from c.social here */ }

    const sub = c.positioning || c.services || ''
    return { name: c.name || '', sub, deltas, hot: i === 0 && c.trend === 'growing' }
  })
  // ── מעקב מתחרים (the NEW competitor module) ──────────────────────────────
  // Pure projection of stored competitor_tracking rows. ZERO model calls, zero
  // scraping: whatever the last tracking run persisted is what the client sees,
  // which is also exactly what the module page shows.
  const competitorTracking: NonNullable<ReportData['competitorTracking']> = (trackingRaw || [])
    .map((row: any) => {
      const links = (row?.resolved_links || {}) as Record<string, string>
      const rv = (row?.reviews || {}) as any
      const ins = (row?.insights || {}) as any
      const sources: any[] = Array.isArray(row?.sources) ? row.sources : []
      const PLATFORM_LABELS = SHARED_LABELS

      // ⭐ Reviews — skipped entirely when no Google business resolved.
      let reviews: any
      if (rv.found && (rv.rating != null || rv.reviewsCount != null)) {
        reviews = {
          rating: rv.rating ?? null,
          total: rv.reviewsCount ?? null,
          headline: rv.rating != null && rv.reviewsCount != null
            ? `${rv.rating}★ · ${Number(rv.reviewsCount).toLocaleString('he-IL')} ביקורות`
            : rv.rating != null ? `${rv.rating}★` : `${Number(rv.reviewsCount).toLocaleString('he-IL')} ביקורות`,
          recent: rv.insights?.recent?.text || undefined,
          sentiment: rv.insights?.sentiment
            ? { dir: rv.insights.sentiment.direction, text: rv.insights.sentiment.text }
            : undefined,
        }
      }

      // 👥 Followers — current counts. Growth needs a prior scan; until then we
      // show the number alone rather than a fake delta.
      const followers = (Array.isArray(ins.followers) ? ins.followers : [])
        .filter((f: any) => typeof f?.followers === 'number' && f.followers > 0)
        .map((f: any) => ({ label: PLATFORM_LABELS[f.source] || f.source, count: f.followers }))

      // 📱 Posts — SHARED with the module page (lib/competitor-intel/display),
      // so both surfaces show the same platform badge, the same explicit
      // like/comment counts, and the same links. Cross-posted content appears
      // once per platform on purpose; the badge is what disambiguates it.
      const toReportPost = (p: DisplayPost, notable?: boolean) => ({
        date: p.dateLabel,
        platform: p.platform,
        platformLabel: p.platformLabel,
        caption: p.caption,
        engagement: engagementLabel(p) || undefined,
        url: p.url || undefined,
        notable,
      })
      const notable = notablePostsFrom(sources, ins, 2).map((p) => toReportPost(p, true))
      const recent = recentPostsFrom(sources, { max: 3 })
        .filter((p) => !notable.some((n) => n.url && n.url === p.url))
        .map((p) => toReportPost(p))
      const posts = [...notable, ...recent]

      // 45-day deterministic insights, already computed at scan time.
      const insights = [
        ins.cadence?.text, ins.presence?.text, ins.themes?.text,
        ins.topPosts?.[0]?.caption ? `הפוסט שהכי עבד להם: ${ins.topPosts[0].caption}` : '',
        rv.insights?.themes?.text,
      ].filter((x: any) => typeof x === 'string' && x.trim()) as string[]

      const CHANGE_ICON: Record<string, string> = {
        product: '🆕', price: '💰', promotion: '🎯', positioning: '📣', location: '📍', other: '•',
      }
      const websiteChanges = (Array.isArray(row?.website?.changes) ? row.website.changes : [])
        .filter((c: any) => c && String(c.text || '').trim())
        .slice(0, 3)
        .map((c: any) => ({
          icon: CHANGE_ICON[String(c.kind)] || '•',
          text: String(c.text).trim(),
          soWhat: String(c.soWhat || '').trim() || undefined,
        }))

      return {
        name: String(row?.competitor_name || '').trim(),
        links: ['website', 'instagram', 'facebook', 'linkedin']
          .filter((k) => links[k])
          .map((k) => ({ label: PLATFORM_LABELS[k], url: links[k] })),
        reviews,
        followers,
        googleUrl: googleListingUrl(links, rv) || undefined,
        posts,
        insights,
        websiteChanges,
        scannedAt: row?.scanned_at || undefined,
      }
    })
    // A competitor with nothing to show is skipped rather than rendered empty.
    .filter((c: any) => c.name && (c.reviews || c.followers.length || c.posts.length || c.insights.length || c.websiteChanges.length))

  // Three-level competitors assembly (read-only — NO model calls):
  //  (a) real changes → the list above.
  //  (b) no changes BUT stored competitor-trends → intro line + top trends, each
  //      with an optional amber "opportunity-for-you".
  //  (c) neither → the calm line alone.
  let competitorsNote: string | null = null
  let competitorTrends: ReportData['competitorTrends'] = []
  if (competitorsOut.length === 0) {
    // (b) is gated: with the competitor-trends module off we stop showing the
    // stored fallback, so the section falls cleanly through to (c) — the calm
    // line — instead of surfacing stale, model-generated trend text. Nothing
    // renders empty-but-labeled: ReportView already treats an empty list as (c).
    const ctData: any[] = COMPETITOR_TRENDS_ENABLED && Array.isArray(company?.competitor_trends?.competitor_data)
      ? company.competitor_trends.competitor_data
      : []
    const storedTrends = ctData
      .filter((c: any) => c && (c.new_activity || (Array.isArray(c.trending_topics) && c.trending_topics.length)))
      .slice(0, 3)
      .map((c: any) => ({
        name: (c.competitor_name || '').trim(),
        topic: (c.new_activity || (Array.isArray(c.trending_topics) ? c.trending_topics[0] : '') || '').trim(),
        opportunity: c.has_opportunity && typeof c.opportunity === 'string' && c.opportunity.trim()
          ? c.opportunity.trim() : undefined,
        sourceUrl: Array.isArray(c.sources) && typeof c.sources[0] === 'string' && /^https?:\/\//.test(c.sources[0])
          ? c.sources[0] : undefined,
      }))
      .filter((t: any) => t.name && t.topic)
    if (storedTrends.length) {
      competitorsNote = 'לא זוהו שינויים מהותיים השבוע — אבל הנה מה שקורה אצל המתחרים:'
      competitorTrends = storedTrends
    } else if (allComp.length > 0) {
      competitorsNote = 'לא זוהו שינויים מהותיים אצל המתחרים השבוע'
    }
  }

  // The rendered section is now "מעקב מתחרים" (competitorTracking above); the
  // legacy note/list are kept in the payload for older snapshots but must not
  // dictate what the current report says. This has the final word.
  if (competitorTracking.length === 0) {
    // Nothing tracked yet: say why, rather than showing an empty section or
    // silently dropping it when the client HAS named competitors.
    const named = Array.isArray(bp?.directCompetitors) ? bp.directCompetitors.filter(Boolean) : []
    competitorsNote = named.length
      ? `המתחרים שהגדרת (${named.slice(0, 5).join(', ')}) ייסרקו בסריקה הקרובה`
      : null
  }

  // ── Tenders section ─────────────────────────────────────────────────────────
  const tendersOut: ReportData['tenders'] = openTenders.slice(0, 3).map((t: any, i: number) => {
    const rs = t.relevance_score ?? null
    const daysLeft = t.deadline ? Math.ceil((new Date(t.deadline).getTime() - Date.now()) / 86400000) : null
    const side = daysLeft != null ? (daysLeft <= 10 ? `⏳ נסגר בעוד ${daysLeft} ימים` : `נסגר בעוד ${daysLeft} ימים`) : 'פתוח — ללא מועד'
    const pill = rs != null
      ? (rs >= 80 ? { kind: 'teal' as const, text: `התאמה ${rs}%` } : { kind: 'amber' as const, text: `התאמה ${rs}%` })
      : undefined
    return { title: t.title || '', sub: [t.organization, t.budget && t.budget !== 'לא צוין' ? t.budget : ''].filter(Boolean).join(' · '), side, pill, hot: i === 0 && (rs ?? 0) >= 80, deadline: daysLeft != null && daysLeft <= 10 }
  })

  // ── Leads grouped by channel ────────────────────────────────────────────────
  const byChannel = new Map<string, any[]>()
  for (const l of leadsSorted.slice(0, 5)) {
    const ch = (l.source || l.industry || 'שותפים').trim() || 'שותפים'
    if (!byChannel.has(ch)) byChannel.set(ch, [])
    byChannel.get(ch)!.push(l)
  }
  // STEP 5: word tags instead of numeric scores (kept sorted by score internally).
  // ≥80 → "התאמה גבוהה", 65–79 → "התאמה טובה", else no tag. No "מוביל" pill.
  const matchTagFor = (score: number): { kind: 'high' | 'good'; text: string } | undefined =>
    score >= 80 ? { kind: 'high', text: 'התאמה גבוהה' }
      : score >= 65 ? { kind: 'good', text: 'התאמה טובה' }
        : undefined
  const leadGroups: ReportData['leadGroups'] = [...byChannel.entries()].map(([channel, ls]) => ({
    channel,
    leads: ls.map((l: any) => ({
      title: l.name || '',
      sub: l.reason || l.industry || '',
      matchTag: matchTagFor(Math.round(l.score ?? 0)),
      website: l.website && /^https?:\/\//i.test(l.website) ? l.website : undefined,
    })),
  }))

  // ── SEO / GEO section (FOCUSED) ─────────────────────────────────────────────
  // STEP 6: ONE primary Google keyword (highest volume where the client ranks),
  // ONE central AI question shown across ChatGPT/Gemini/Grok side by side, then
  // up to 3 expressions total. No baseless % badges (we have no prior SEO
  // position stored → omit rank badges entirely).
  const rankedSeo = seoVariants
    .slice()
    .sort((a, b) => {
      if (a.appeared !== b.appeared) return a.appeared ? -1 : 1
      return (b.searchVolume ?? 0) - (a.searchVolume ?? 0)
    })
  const toSeoRow = (v: any) => {
    const pos = v.appeared && num(v.position) != null ? (v.position as number) : null
    const vol = num(v.searchVolume)
    return {
      query: v.query as string,
      rank: pos != null ? String(pos) : '—',
      unranked: pos == null,   // not found in Google (beyond top 100)
      sub: `גוגל${vol ? ` · ${vol.toLocaleString('he-IL')} חיפושים בחודש` : ''}`,
      warn: pos != null && pos > 5,
    }
  }
  // Primary = highest-volume keyword where the client actually ranks (appeared).
  const primaryVariant = rankedSeo.find((v) => v.appeared && num(v.position) != null) || rankedSeo[0] || null
  const seoPrimaryRow = primaryVariant ? toSeoRow(primaryVariant) : null
  const seoPrimary: ReportData['seoPrimary'] = seoPrimaryRow
    ? { query: `"${seoPrimaryRow.query}"`, rank: seoPrimaryRow.rank, sub: seoPrimaryRow.sub, warn: seoPrimaryRow.warn, unranked: seoPrimaryRow.unranked }
    : null
  // Up to 2 more expressions (total ≤ 3), excluding the primary.
  const seoExtras: ReportData['seoExtras'] = rankedSeo
    .filter((v) => v !== primaryVariant)
    .slice(0, 2)
    .map((v) => { const r = toSeoRow(v); return { query: `"${r.query}"`, rank: r.rank, sub: r.sub, warn: r.warn, unranked: r.unranked } })

  // ── GEO: up to 3 AI questions, each with the client's position per engine ────
  // Uses the SHARED reader (lib/geo/read) that mirrors the app GEO page's exact
  // access path + lenient position check. This fixes the empty-GEO bug: the old
  // read cast position through num() (strict number), dropping numeric-string
  // positions the page accepts. Read-only, no AI. Questions with no engine data
  // at all are skipped; unranked engines show "לא מופיע" (never a bare blank).
  const seoAiQuestions: NonNullable<ReportData['seoAiQuestions']> = readGeoQuestions(geoRanking, 3)
    .filter((q) => q.hasEngineData)
    .map((q) => ({
      question: q.question,
      engines: q.engines.map((e) => ({
        name: e.name,
        rank: e.appeared ? `#${e.position}` : 'לא מופיע',
        appeared: e.appeared,
      })),
    }))
  const seoAi: ReportData['seoAi'] = seoAiQuestions[0] ?? null // backward compat (single)

  // FIX 1: lead with the AI block when the client has NO Google rank across the
  // shown queries but DOES appear in an AI engine (that's where they shine).
  const hasGoogleRank = (seoPrimary != null && !seoPrimary.unranked) || (seoExtras || []).some((e) => !e.unranked)
  const hasAiPresence = seoAiQuestions.some((q) => q.engines.some((e) => e.appeared))
  const seoAiFirst = !hasGoogleRank && hasAiPresence

  // Legacy flat list left empty — the focused fields above drive the new render.
  const seoOut: ReportData['seo'] = []

  // ── Demand sparkline (STEP 6) ───────────────────────────────────────────────
  // Real 12-month DataForSEO history (keyword_trends[kw].monthlySeries). Match the
  // SEO primary keyword first; else fall back to the highest-volume keyword that
  // HAS history. Skip entirely if no monthlySeries is stored (Grok-only fallback).
  const seriesFor = (kw: string): number[] => {
    const target = norm(kw)
    const hit = Object.values(ktMap).find((k: any) => norm(k?.keyword || '') === target) as any
    return Array.isArray(hit?.monthlySeries) ? hit.monthlySeries.filter((n: any) => typeof n === 'number') : []
  }
  let demand: ReportData['demand'] = null
  if (seoPrimaryRow) {
    const s = seriesFor(seoPrimaryRow.query)
    if (s.length >= 3) demand = { keyword: seoPrimaryRow.query, series: s, label: 'ביקוש ב־12 החודשים האחרונים (Google)' }
  }
  if (!demand) {
    const withHistory = trendEntries.find((k: any) => Array.isArray(k?.monthlySeries) && k.monthlySeries.filter((n: any) => typeof n === 'number').length >= 3) as any
    if (withHistory) demand = { keyword: withHistory.keyword, series: withHistory.monthlySeries.filter((n: any) => typeof n === 'number'), label: 'ביקוש ב־12 החודשים האחרונים (Google)' }
  }

  // ── Trends section (top 3, real deltas) ─────────────────────────────────────
  // STEP 6: every % states its base ("מהרבעון הקודם" — recent-3mo vs prior-3mo,
  // per DataForSEO). A baseless number is never shown → no real data ⇒ "יציב".
  const trendsOut: ReportData['trends'] = trendEntries.slice(0, 3).map((k: any) => {
    const dir = k.direction as string
    const pct = num(k.changePct)
    const hasBase = pct != null && !k.lowData
    const badge = (dir === 'rising' && hasBase)
      ? { kind: 'up' as const, text: `▲ +${Math.abs(pct as number)}% מהרבעון הקודם` }
      : (dir === 'falling' && hasBase)
        ? { kind: 'down' as const, text: `▼ ${pct}% מהרבעון הקודם` }
        : { kind: 'flat' as const, text: 'יציב' }
    return {
      title: k.keyword || '',
      sub: `${(k.searchVolume ?? 0).toLocaleString('he-IL')} חיפושים בחודש`,
      badge,
      hot: dir === 'rising' && hasBase && (pct as number) >= 15,
    }
  })

  // ── Industry hot trends (stored industry_trends — read-only, real links) ────
  const itData: any[] = Array.isArray(company?.industry_trends?.trends) ? company.industry_trends.trends : []
  const industryTrends: ReportData['industryTrends'] = itData
    .filter((t: any) => t && typeof t.name === 'string' && t.name.trim())
    .slice(0, 3)
    .map((t: any) => ({
      title: t.name.trim(),
      badge: t.direction === 'rising'
        ? { kind: 'up' as const, text: '▲ במגמת עלייה' }
        : t.direction === 'declining'
          ? { kind: 'down' as const, text: '▼ במגמת ירידה' }
          : { kind: 'flat' as const, text: 'יציב' },
      // source_url was validated against real grounding citations at generation
      // time — shape-check again here; absent → no link rendered (never invented).
      sourceUrl: typeof t.source_url === 'string' && /^https?:\/\/[^/]+/.test(t.source_url) ? t.source_url : undefined,
    }))

  // ── Conferences (up to 2) ───────────────────────────────────────────────────
  const confsOut: ReportData['conferences'] = upcomingConfs.slice(0, 2).map((c: any) => ({
    title: c.name || '',
    // Dates are free text: render a Hebrew day/month for exact ISO dates, else
    // the original text, else "מועד יוכרז" — never a blank or a stale value.
    sub: [
      parseConferenceDate(c.date).precision === 'day' ? (heDay(c.date) || conferenceDateLabel(c.date)) : conferenceDateLabel(c.date),
      c.location,
    ].filter(Boolean).join(' · '),
    side: c.url ? 'הרשמה פתוחה' : 'פרטים בקרוב',
    pill: parseConfDesc(c.description).score != null && parseConfDesc(c.description).score! >= 70 ? 'התאמה גבוהה' : undefined,
  }))

  // ── News (up to 2) ──────────────────────────────────────────────────────────
  const newsOut: ReportData['news'] = (news || []).slice(0, 2).map((n: any) => ({
    title: n.title || '',
    sub: n.summary || '',
    pill: n.category || undefined,
  }))

  const scanDate = heDate(company?.last_sync_at)
  const periodEnd = company?.last_sync_at ? new Date(company.last_sync_at) : null
  const periodStart = periodEnd ? new Date(periodEnd.getTime() - 6 * 86400000) : null
  const period = periodStart && periodEnd ? `${heDay(periodStart.toISOString())}–${heDay(periodEnd.toISOString())}` : ''

  // FIX 2: the next-scan date must be a REAL future date. next_sync_at is
  // sometimes missing or not advanced past the current scan — never show a date
  // ≤ the current scan date; fall back to scan date + 7 days.
  const dayOf = (d: Date) => d.toISOString().split('T')[0]
  const scanRef = periodEnd || new Date()
  let nextScanDate = company?.next_sync_at ? new Date(company.next_sync_at) : null
  if (!nextScanDate || isNaN(nextScanDate.getTime()) || dayOf(nextScanDate) <= dayOf(scanRef)) {
    nextScanDate = new Date(scanRef.getTime() + 7 * 86400000)
  }

  return {
    companyName: company?.name || 'העסק שלך',
    scanDate,
    period,
    area,
    nextScan: heDate(nextScanDate.toISOString()),
    achievement,
    thesis: { big: thesisBig, sub: thesisSub },
    metrics,
    actions,
    competitors: competitorsOut,
    competitorsNote,
    competitorTrends,
    competitorTracking,
    industryTrends,
    tenders: tendersOut,
    leadGroups,
    seo: seoOut,
    seoPrimary,
    seoAi,
    seoAiQuestions,
    seoExtras,
    seoAiFirst,
    demand,
    trends: trendsOut,
    conferences: confsOut,
    news: newsOut,
  }
}
