// Read-only assembly of a company's PUBLIC web report from the LATEST stored
// scan results. NO AI calls, NO generation — pure deterministic reading of what
// the scan already produced. Missing modules → the field is empty and the page
// hides that section.
//
// Admin-hidden items (admin_hidden_items) are filtered out here so they never
// appear in the client web report OR in snapshots (snapshots reuse this fn).

import { loadHiddenKeys, filterHidden } from '@/lib/admin/hidden'

const FIELD_SEP = '␟'

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
  tenders: Array<{ title: string; sub: string; side: string; pill?: { kind: 'teal' | 'amber'; text: string }; hot?: boolean; deadline?: boolean }>
  leadGroups: Array<{ channel: string; leads: Array<{ title: string; sub: string; score: number; hot?: boolean }> }>
  seo: Array<{ rank: string; title: string; sub: string; badge?: { kind: 'up' | 'down' | 'flat'; text: string }; warn?: boolean }>
  trends: Array<{ title: string; sub: string; badge: { kind: 'up' | 'down' | 'flat'; text: string }; hot?: boolean }>
  conferences: Array<{ title: string; sub: string; side: string; pill?: string }>
  news: Array<{ title: string; sub: string; pill?: string }>
}

const num = (v: any): number | null => (typeof v === 'number' && isFinite(v) ? v : null)

export async function assembleReport(db: any, companyId: string, company: any): Promise<ReportData> {
  const bp = (company?.business_profile ?? {}) as any
  const city = (company?.city || '').trim()
  const geoArea: string[] = Array.isArray(company?.geographic_area) ? company.geographic_area.filter(Boolean) : []
  const area = city || geoArea.join(', ') || 'ישראל'
  const today = new Date().toISOString().split('T')[0]

  const [[{ data: competitorsRaw }, { data: tendersRaw }, { data: leadsRaw }, { data: conferencesRaw }, { data: newsRaw }], hiddenKeys] =
    await Promise.all([
      Promise.all([
        db.from('competitors').select('name, website, threat_score, positioning, trend, services, google_rating, google_review_count').eq('company_id', companyId),
        db.from('tenders').select('title, organization, deadline, budget, link, relevance_score, description, created_at').eq('company_id', companyId),
        db.from('leads').select('name, website, industry, reason, score, source, location').eq('company_id', companyId),
        db.from('conferences').select('name, date, location, description, url, category').eq('company_id', companyId),
        db.from('news').select('title, source, url, summary, category, published_at').eq('company_id', companyId).order('published_at', { ascending: false }),
      ]),
      loadHiddenKeys(companyId, undefined, db),
    ])

  // Drop admin-hidden items before anything is computed/shown.
  const competitors = filterHidden(competitorsRaw as any[], 'competitor', hiddenKeys, (c: any) => c.name)
  const tenders = filterHidden(tendersRaw as any[], 'tender', hiddenKeys, (t: any) => t.title)
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
  const upcomingConfs = (conferences || [])
    .filter((c: any) => !c.date || c.date >= today)
    .sort((a: any, b: any) => parseConfDesc(b.description).score! - parseConfDesc(a.description).score! || 0)

  // ── Weekly actions ──────────────────────────────────────────────────────────
  const waActions: any[] = Array.isArray(company?.weekly_actions?.actions) ? company.weekly_actions.actions : []
  const sortedActions = [
    ...waActions.filter((a) => a.priority === 'גבוהה'),
    ...waActions.filter((a) => a.priority !== 'גבוהה'),
  ].slice(0, 5)

  // ── Achievement of the week (deterministic, absolute — no history needed) ────
  let achievement: ReportData['achievement'] = null
  const topSeo = appearedSeo.filter((v) => (v.position as number) <= 3).sort((a, b) => a.position - b.position)[0]
  const bestTender = openTenders[0]
  const topLead = leadsSorted[0]
  if (topSeo) {
    achievement = { title: 'הישג השבוע: אתה בטופ 3 בגוגל', sub: `"${topSeo.query}" — מקום #${topSeo.position} בתוצאות` }
  } else if (geoPos != null && geoPos <= 3) {
    achievement = { title: 'הישג השבוע: מומלץ במנועי AI', sub: `העסק שלך מופיע במקום #${geoPos} בהמלצות ChatGPT/Gemini` }
  } else if (bestTender && (bestTender.relevance_score ?? 0) >= 85) {
    achievement = { title: 'הישג השבוע: מכרז בהתאמה גבוהה', sub: `"${bestTender.title}" — התאמה ${bestTender.relevance_score}%` }
  } else if (topLead && (topLead.score ?? 0) >= 80) {
    achievement = { title: 'הישג השבוע: שותף מוביל זוהה', sub: `${topLead.name} — ציון ליד ${topLead.score}` }
  }

  // ── Thesis (template) ───────────────────────────────────────────────────────
  const oppCount = openTenders.length + leadsSorted.length
  const risingKw = trendEntries.find((k: any) => k.direction === 'rising')
  const thesisBig = oppCount > 0
    ? `${oppCount} הזדמנויות חדשות השבוע — <em>שווה לעבור עליהן לפי סדר עדיפות</em>.`
    : `סיכום הסריקה השבועית — <em>הנה התמונה המלאה</em>.`
  const thesisSubParts: string[] = []
  if (topSeo) thesisSubParts.push(`אתה בטופ 3 בגוגל על "${topSeo.query}"`)
  else if (avgSeoPos != null) thesisSubParts.push(`מיקום ממוצע ${avgSeoPos} בגוגל`)
  if (bestTender) thesisSubParts.push('נמצאו מכרזים רלוונטיים')
  if (leadsSorted.length) thesisSubParts.push(`${leadsSorted.length} שותפים פוטנציאליים`)
  if (risingKw) thesisSubParts.push(`"${risingKw.keyword}" בעלייה`)
  const thesisSub = thesisSubParts.length ? thesisSubParts.join(' · ') + '.' : ''

  // ── Metrics strip ───────────────────────────────────────────────────────────
  const metrics: ReportData['metrics'] = []
  if (avgSeoPos != null) metrics.push({ num: String(avgSeoPos), label: `מיקום ממוצע בגוגל<br>(${appearedSeo.length} מילות מפתח)`, hot: avgSeoPos <= 5 })
  if (geoPos != null) metrics.push({ num: `#${geoPos}`, label: 'מיקום בהמלצות AI<br>(ChatGPT, Gemini)', hot: geoPos <= 3 })
  if (openTenders.length) metrics.push({ num: String(openTenders.length), label: 'מכרזים רלוונטיים<br>פתוחים כרגע' })
  if (leadsSorted.length) metrics.push({ num: String(leadsSorted.length), label: 'שותפים פוטנציאליים<br>שזוהו' })
  if (upcomingConfs.length) metrics.push({ num: String(upcomingConfs.length), label: 'כנסים רלוונטיים<br>קרובים', badge: { kind: 'flat', text: 'קרובים' } })

  // ── Actions ─────────────────────────────────────────────────────────────────
  const actions: ReportData['actions'] = sortedActions.map((a) => {
    const sig = Array.isArray(a.signals) && a.signals[0] ? a.signals[0] : null
    const srcLabel = sig?.label ? `מקור: ${sig.label}` : (a.category ? `מקור: ${a.category}` : '')
    const kind = a.priority === 'גבוהה' ? 'urgent' : a.category === 'מתחרה' ? 'watch' : ''
    const chip = a.category === 'מכרז'
      ? { kind: 'urgent' as const, text: 'דדליין' }
      : a.category === 'ליד'
        ? { kind: 'go' as const, text: 'הזדמנות' }
        : a.priority === 'גבוהה'
          ? { kind: 'urgent' as const, text: 'דחוף' }
          : { kind: 'watch' as const, text: 'לתשומת לב' }
    return { title: a.title || '', why: a.summary || a.details || '', src: srcLabel, chip, kind: kind as any }
  })

  // ── Competitors ─────────────────────────────────────────────────────────────
  const compRows = (competitors || [])
    .slice()
    .sort((a: any, b: any) => (b.threat_score ?? 0) - (a.threat_score ?? 0))
    .slice(0, 3)
  const competitorsOut: ReportData['competitors'] = compRows.map((c: any, i: number) => {
    const deltas: ReportData['competitors'][number]['deltas'] = []
    if (c.trend === 'growing') deltas.push({ kind: 'bad', text: 'במגמת עלייה ▲' })
    else if (c.trend === 'declining') deltas.push({ kind: 'good', text: 'במגמת ירידה ▼' })
    else deltas.push({ kind: 'neutral', text: 'יציב' })
    if (c.google_rating) deltas.push({ kind: 'neutral', text: `${c.google_rating}★${c.google_review_count ? ` (${c.google_review_count})` : ''}` })
    const sub = c.positioning || c.services || ''
    return { name: c.name || '', sub, deltas, hot: i === 0 && c.trend === 'growing' }
  })

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
  const leadGroups: ReportData['leadGroups'] = [...byChannel.entries()].map(([channel, ls]) => ({
    channel,
    leads: ls.map((l: any, i: number) => ({
      title: l.name || '',
      sub: l.reason || l.industry || '',
      score: Math.round(l.score ?? 0),
      hot: i === 0 && (l.score ?? 0) >= 80,
    })),
  }))

  // ── SEO section (top 3) ─────────────────────────────────────────────────────
  const seoTop = seoVariants
    .slice()
    .sort((a, b) => {
      if (a.appeared !== b.appeared) return a.appeared ? -1 : 1
      return (b.searchVolume ?? 0) - (a.searchVolume ?? 0)
    })
    .slice(0, 3)
  const seoOut: ReportData['seo'] = seoTop.map((v) => {
    const pos = v.appeared && num(v.position) != null ? (v.position as number) : null
    const vol = num(v.searchVolume)
    return {
      rank: pos != null ? String(pos) : '—',
      title: `"${v.query}"`,
      sub: `גוגל${vol ? ` · ${vol.toLocaleString('he-IL')} חיפושים בחודש` : ''}`,
      warn: pos != null && pos > 5,
    }
  })

  // ── Trends section (top 3, real deltas) ─────────────────────────────────────
  const trendsOut: ReportData['trends'] = trendEntries.slice(0, 3).map((k: any) => {
    const dir = k.direction as string
    const pct = num(k.changePct)
    const badge = dir === 'rising'
      ? { kind: 'up' as const, text: `▲ +${Math.abs(pct ?? 0)}%` }
      : dir === 'falling'
        ? { kind: 'down' as const, text: `▼ ${pct ?? 0}%` }
        : { kind: 'flat' as const, text: 'יציב' }
    return {
      title: k.keyword || '',
      sub: `${(k.searchVolume ?? 0).toLocaleString('he-IL')} חיפושים בחודש`,
      badge,
      hot: dir === 'rising' && (pct ?? 0) >= 15,
    }
  })

  // ── Conferences (up to 2) ───────────────────────────────────────────────────
  const confsOut: ReportData['conferences'] = upcomingConfs.slice(0, 2).map((c: any) => ({
    title: c.name || '',
    sub: [heDay(c.date), c.location].filter(Boolean).join(' · '),
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

  return {
    companyName: company?.name || 'העסק שלך',
    scanDate,
    period,
    area,
    nextScan: heDate(company?.next_sync_at),
    achievement,
    thesis: { big: thesisBig, sub: thesisSub },
    metrics,
    actions,
    competitors: competitorsOut,
    tenders: tendersOut,
    leadGroups,
    seo: seoOut,
    trends: trendsOut,
    conferences: confsOut,
    news: newsOut,
  }
}
