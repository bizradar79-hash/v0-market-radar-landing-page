import PDFDocument from 'pdfkit'

const BRAND = '#0d9488'
const BRAND_DARK = '#0f766e'
const GRAY = '#374151'
const LIGHT_GRAY = '#9ca3af'

// Cache font buffer in memory across invocations
let fontCache: Buffer | null = null
const FONT_URL = 'https://cdn.jsdelivr.net/fontsource/fonts/heebo@latest/hebrew-400-normal.ttf'
const FONT_BOLD_URL = 'https://cdn.jsdelivr.net/fontsource/fonts/heebo@latest/hebrew-700-normal.ttf'
let fontBoldCache: Buffer | null = null

async function loadFont(url: string, cache: 'regular' | 'bold'): Promise<Buffer> {
  if (cache === 'regular' && fontCache) return fontCache
  if (cache === 'bold' && fontBoldCache) return fontBoldCache

  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`Font fetch failed: ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())

  if (cache === 'regular') fontCache = buf
  else fontBoldCache = buf
  return buf
}

export interface WeeklyReportPdfData {
  companyName: string
  weekDate: string
  report: {
    executive_summary?: string
    seo_geo?: { summary?: string; opportunities?: string[] }
    competitors?: { summary?: string; threats?: { name: string; threat_score: number; threat: string }[]; opportunities?: string[] }
    trends?: {
      hot_keywords?: string[]
      competitor_moves?: string[]
      market_insights?: string[]
      keyword_intel?: { keyword: string; searchVolume: number; direction?: string; directionHe?: string; changePct?: number; competition?: string; competitionHe?: string; cpc?: number; insight?: string }[]
      keyword_opportunities?: { keyword: string; searchVolume: number; direction?: string; directionHe?: string; changePct?: number; opportunityLevel?: 'hot' | 'good' | null; seedKeyword?: string }[]
    }
    opportunities?: { new_niches?: string[]; distribution_channels?: string[]; actions?: string[] }
    news_tenders?: {
      relevant_news?: { title: string; summary?: string }[]
      active_tenders?: { title: string; deadline?: string; organization?: string }[]
      upcoming_conferences?: { name: string; date?: string }[]
    }
    weekly_actions?: { immediate?: string[]; short_term?: string[] }
  }
  highlights?: {
    competitors?: string
    trends?: string
    news?: string
    conferences?: string
    tenders?: string
  }
}

function addSection(doc: InstanceType<typeof PDFDocument>, title: string, content: string | string[], pageWidth: number, margin: number) {
  const textWidth = pageWidth - margin * 2

  // Check if we need a new page (at least 80pt needed for a section)
  if (doc.y > 700) doc.addPage()

  // Section title
  doc
    .font('HeeboBold')
    .fontSize(12)
    .fillColor('#111827')
    .text(title, margin, doc.y, { width: textWidth, align: 'right' })

  doc.moveDown(0.3)

  // Divider line
  const lineY = doc.y
  doc
    .strokeColor('#e5e7eb')
    .lineWidth(0.5)
    .moveTo(margin, lineY)
    .lineTo(pageWidth - margin, lineY)
    .stroke()

  doc.moveDown(0.4)

  // Content
  doc.font('Heebo').fontSize(10).fillColor(GRAY)

  if (Array.isArray(content)) {
    for (const item of content) {
      if (!item) continue
      if (doc.y > 740) doc.addPage()
      doc.text(item, margin, doc.y, { width: textWidth, align: 'right', lineGap: 3 })
      doc.moveDown(0.2)
    }
  } else {
    doc.text(content || '', margin, doc.y, { width: textWidth, align: 'right', lineGap: 3 })
  }

  doc.moveDown(1)
}

export async function generateWeeklyReportPdf(data: WeeklyReportPdfData): Promise<Buffer> {
  const [fontRegular, fontBold] = await Promise.all([
    loadFont(FONT_URL, 'regular'),
    loadFont(FONT_BOLD_URL, 'bold'),
  ])

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: {
        Title: `דוח שבועי — ${data.companyName}`,
        Author: 'North Star Radar',
      },
    })

    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    // Register fonts
    doc.registerFont('Heebo', fontRegular)
    doc.registerFont('HeeboBold', fontBold)

    const pageWidth = doc.page.width
    const margin = 50

    // ── Header bar ──────────────────────────────────────────────
    doc
      .roundedRect(margin, 50, pageWidth - margin * 2, 60, 8)
      .fill(BRAND)

    doc
      .font('HeeboBold')
      .fontSize(18)
      .fillColor('#ffffff')
      .text(`North Star Radar — ${data.companyName}`, margin + 15, 62, {
        width: pageWidth - margin * 2 - 30,
        align: 'right',
      })

    doc
      .font('Heebo')
      .fontSize(10)
      .fillColor('#ccfbf1')
      .text(`דוח שבועי | ${data.weekDate}`, margin + 15, 86, {
        width: pageWidth - margin * 2 - 30,
        align: 'right',
      })

    doc.y = 130

    // ── Executive Summary ───────────────────────────────────────
    const { report, highlights } = data
    if (report?.executive_summary) {
      doc
        .roundedRect(margin, doc.y, pageWidth - margin * 2, 4, 0)
        .fill(BRAND)

      doc.y += 8

      doc
        .font('HeeboBold')
        .fontSize(12)
        .fillColor(BRAND_DARK)
        .text('תמצית מנהלים', margin, doc.y, { width: pageWidth - margin * 2, align: 'right' })

      doc.moveDown(0.4)

      doc
        .font('Heebo')
        .fontSize(10)
        .fillColor(GRAY)
        .text(report.executive_summary, margin, doc.y, {
          width: pageWidth - margin * 2,
          align: 'right',
          lineGap: 4,
        })

      doc.moveDown(1.5)
    }

    // ── Sections ────────────────────────────────────────────────
    const hasFullReport = !!report?.executive_summary

    if (hasFullReport) {
      if (report.seo_geo?.summary) {
        addSection(doc, 'דירוג SEO וGEO', [
          report.seo_geo.summary,
          ...(report.seo_geo.opportunities || []),
        ], pageWidth, margin)
      }

      if (report.competitors?.summary) {
        addSection(doc, 'מתחרים', [
          report.competitors.summary,
          ...(report.competitors.threats || []).map((t: any) => `${t.name} (ציון: ${t.threat_score}) — ${t.threat}`),
          ...(report.competitors.opportunities || []),
        ], pageWidth, margin)
      }

      // Dedicated keyword section — REAL DataForSEO numbers (no emoji, Heebo-safe).
      if (report.trends?.keyword_intel?.length) {
        const fmtPct = (v?: number) => {
          const n = typeof v === 'number' ? v : 0
          return `${n > 0 ? '+' : ''}${n}%`
        }
        const fmtVol = (v?: number) => (typeof v === 'number' ? v : 0).toLocaleString('he-IL')
        const kwLines: string[] = []
        for (const k of report.trends.keyword_intel) {
          const dirHe = k.directionHe || (k.direction === 'rising' ? 'עולה' : k.direction === 'falling' ? 'יורד' : 'יציב')
          let line = `"${k.keyword}" — ${fmtVol(k.searchVolume)} חיפושים/חודש, ${dirHe} ${fmtPct(k.changePct)}`
          if (k.competitionHe && k.competitionHe !== '—') line += `, תחרות פרסומית ${k.competitionHe}`
          if (typeof k.cpc === 'number' && k.cpc > 0) line += `, CPC $${k.cpc}`
          kwLines.push(line)
          if (k.insight) kwLines.push(`   ${k.insight}`)
        }
        for (const o of report.trends.keyword_opportunities || []) {
          const dirHe = o.directionHe || (o.direction === 'rising' ? 'עולה' : o.direction === 'falling' ? 'יורד' : 'יציב')
          kwLines.push(`הזדמנות long-tail: "${o.keyword}" — ${fmtVol(o.searchVolume)} חיפושים/חודש, ${dirHe} ${fmtPct(o.changePct)}`)
        }
        addSection(doc, 'מילות מפתח ומגמות', kwLines, pageWidth, margin)
      }

      const hasKwIntel = !!report.trends?.keyword_intel?.length
      const trendsExtra = [
        // Only fall back to AI hot_keywords when we have no real keyword intel.
        ...(hasKwIntel ? [] : (report.trends?.hot_keywords || []).map((k: string) => `מילת מפתח: ${k}`)),
        ...(report.trends?.competitor_moves || []),
        ...(report.trends?.market_insights || []),
      ]
      if (trendsExtra.length) {
        addSection(doc, 'טרנדים ותובנות שוק', trendsExtra, pageWidth, margin)
      }

      if (report.opportunities?.new_niches?.length || report.opportunities?.actions?.length) {
        addSection(doc, 'הזדמנויות עסקיות', [
          ...(report.opportunities?.new_niches || []),
          ...(report.opportunities?.distribution_channels || []),
          ...(report.opportunities?.actions || []),
        ], pageWidth, margin)
      }

      const newsItems = [
        ...(report.news_tenders?.relevant_news || []).map((n: any) => `חדשות: ${n.title}`),
        ...(report.news_tenders?.active_tenders || []).map((t: any) => `מכרז: ${t.title}${t.deadline ? ` (עד ${t.deadline})` : ''}`),
        ...(report.news_tenders?.upcoming_conferences || []).map((c: any) => `כנס: ${c.name}${c.date ? ` (${c.date})` : ''}`),
      ]
      if (newsItems.length) {
        addSection(doc, 'חדשות, מכרזים וכנסים', newsItems, pageWidth, margin)
      }

      if (report.weekly_actions?.immediate?.length || report.weekly_actions?.short_term?.length) {
        addSection(doc, 'משימות שבועיות', [
          ...(report.weekly_actions?.immediate || []),
          ...(report.weekly_actions?.short_term || []),
        ], pageWidth, margin)
      }
    } else if (highlights) {
      addSection(doc, 'מודיעין מתחרים', highlights.competitors || 'אין מידע זמין', pageWidth, margin)
      addSection(doc, 'טרנדים בשוק', highlights.trends || 'אין מידע זמין', pageWidth, margin)
      addSection(doc, 'חדשות מהענף', highlights.news || 'אין מידע זמין', pageWidth, margin)
      addSection(doc, 'כנסים קרובים', highlights.conferences || 'אין מידע זמין', pageWidth, margin)
      addSection(doc, 'מכרזים', highlights.tenders || 'אין מידע זמין', pageWidth, margin)
    }

    // ── Footer ──────────────────────────────────────────────────
    const pages = doc.bufferedPageRange()
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i)
      doc
        .font('Heebo')
        .fontSize(7)
        .fillColor(LIGHT_GRAY)
        .text(
          'North Star Radar | www.nsradar.co.il | support@nsradar.co.il',
          margin,
          doc.page.height - 35,
          { width: pageWidth - margin * 2, align: 'center' },
        )
    }

    doc.end()
  })
}
