import React from 'react'
import { Document, Page, Text, View, StyleSheet, Font, renderToBuffer } from '@react-pdf/renderer'

// Register Hebrew font (Heebo from Google Fonts)
Font.register({
  family: 'Heebo',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/heebo/v26/NGSpv5_NC0k9P_v6ZUCbLRAHxK1EiSysd0mm_00.ttf', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/heebo/v26/NGSpv5_NC0k9P_v6ZUCbLRAHxK1ECSysd0mm_00.ttf', fontWeight: 700 },
  ],
})

// Disable hyphenation for Hebrew
Font.registerHyphenationCallback((word) => [word])

const BRAND = '#0d9488'

const s = StyleSheet.create({
  page: {
    fontFamily: 'Heebo',
    fontSize: 11,
    padding: 40,
    paddingTop: 50,
    paddingBottom: 60,
    backgroundColor: '#ffffff',
  },
  // Header
  headerBar: {
    backgroundColor: BRAND,
    borderRadius: 8,
    padding: 20,
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: '#ffffff',
    textAlign: 'right',
    direction: 'rtl',
  },
  headerSub: {
    fontSize: 10,
    color: '#ccfbf1',
    textAlign: 'right',
    direction: 'rtl',
    marginTop: 6,
  },
  // Executive summary
  execBox: {
    backgroundColor: '#f0fdfa',
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: BRAND,
    borderLeftStyle: 'solid',
  },
  execLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: BRAND,
    textAlign: 'right',
    direction: 'rtl',
    marginBottom: 8,
  },
  execText: {
    fontSize: 11,
    lineHeight: 1.7,
    color: '#1f2937',
    textAlign: 'right',
    direction: 'rtl',
  },
  // Section
  section: {
    marginBottom: 16,
    borderRadius: 6,
    border: '1px solid #e5e7eb',
    padding: 14,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: '#111827',
    textAlign: 'right',
    direction: 'rtl',
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    borderBottomStyle: 'solid',
  },
  sectionText: {
    fontSize: 10,
    lineHeight: 1.7,
    color: '#374151',
    textAlign: 'right',
    direction: 'rtl',
  },
  bulletItem: {
    fontSize: 10,
    lineHeight: 1.7,
    color: '#374151',
    textAlign: 'right',
    direction: 'rtl',
    marginBottom: 3,
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 25,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 8,
    color: '#9ca3af',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    borderTopStyle: 'solid',
    paddingTop: 10,
  },
})

interface ReportSection {
  icon: string
  title: string
  content: string | string[]
}

function SectionBlock({ icon, title, content }: ReportSection) {
  const items = Array.isArray(content) ? content : [content]
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title} {icon}</Text>
      {items.map((item, i) => (
        <Text key={i} style={Array.isArray(content) ? s.bulletItem : s.sectionText}>
          {Array.isArray(content) ? `• ${item}` : item}
        </Text>
      ))}
    </View>
  )
}

interface WeeklyReportPdfData {
  companyName: string
  weekDate: string
  report: {
    executive_summary?: string
    seo_geo?: { summary?: string; opportunities?: string[] }
    competitors?: { summary?: string; threats?: { name: string; threat_score: number; threat: string }[]; opportunities?: string[] }
    trends?: { hot_keywords?: string[]; competitor_moves?: string[]; market_insights?: string[] }
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

function WeeklyReportDocument({ companyName, weekDate, report, highlights }: WeeklyReportPdfData) {
  const hasFullReport = !!report?.executive_summary

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.headerBar}>
          <Text style={s.headerTitle}>North Star Radar — {companyName}</Text>
          <Text style={s.headerSub}>דוח שבועי | {weekDate}</Text>
        </View>

        {/* Executive Summary */}
        {report?.executive_summary && (
          <View style={s.execBox}>
            <Text style={s.execLabel}>תמצית מנהלים</Text>
            <Text style={s.execText}>{report.executive_summary}</Text>
          </View>
        )}

        {hasFullReport ? (
          <>
            {/* SEO/GEO */}
            {report.seo_geo?.summary && (
              <SectionBlock icon="🔍" title="דירוג SEO וGEO" content={[
                report.seo_geo.summary,
                ...(report.seo_geo.opportunities || []),
              ]} />
            )}

            {/* Competitors */}
            {report.competitors?.summary && (
              <SectionBlock icon="👥" title="מתחרים" content={[
                report.competitors.summary,
                ...(report.competitors.threats || []).map(t => `${t.name} (ציון: ${t.threat_score}) — ${t.threat}`),
                ...(report.competitors.opportunities || []),
              ]} />
            )}

            {/* Trends */}
            {(report.trends?.hot_keywords?.length || report.trends?.market_insights?.length) && (
              <SectionBlock icon="📈" title="טרנדים ותובנות שוק" content={[
                ...(report.trends?.hot_keywords || []).map(k => `מילת מפתח: ${k}`),
                ...(report.trends?.competitor_moves || []),
                ...(report.trends?.market_insights || []),
              ]} />
            )}

            {/* Opportunities */}
            {(report.opportunities?.new_niches?.length || report.opportunities?.actions?.length) && (
              <SectionBlock icon="🎯" title="הזדמנויות עסקיות" content={[
                ...(report.opportunities?.new_niches || []),
                ...(report.opportunities?.distribution_channels || []),
                ...(report.opportunities?.actions || []),
              ]} />
            )}

            {/* News & Tenders */}
            <SectionBlock icon="📰" title="חדשות, מכרזים וכנסים" content={[
              ...(report.news_tenders?.relevant_news || []).map(n => `חדשות: ${n.title}`),
              ...(report.news_tenders?.active_tenders || []).map(t => `מכרז: ${t.title}${t.deadline ? ` (עד ${t.deadline})` : ''}`),
              ...(report.news_tenders?.upcoming_conferences || []).map(c => `כנס: ${c.name}${c.date ? ` (${c.date})` : ''}`),
            ]} />

            {/* Weekly Actions */}
            {(report.weekly_actions?.immediate?.length || report.weekly_actions?.short_term?.length) && (
              <SectionBlock icon="⚡" title="משימות שבועיות" content={[
                ...(report.weekly_actions?.immediate || []).map(a => `🔴 ${a}`),
                ...(report.weekly_actions?.short_term || []).map(a => `🔵 ${a}`),
              ]} />
            )}
          </>
        ) : highlights ? (
          <>
            <SectionBlock icon="📊" title="מודיעין מתחרים" content={highlights.competitors || 'אין מידע זמין'} />
            <SectionBlock icon="📈" title="טרנדים בשוק" content={highlights.trends || 'אין מידע זמין'} />
            <SectionBlock icon="📰" title="חדשות מהענף" content={highlights.news || 'אין מידע זמין'} />
            <SectionBlock icon="🎪" title="כנסים קרובים" content={highlights.conferences || 'אין מידע זמין'} />
            <SectionBlock icon="📋" title="מכרזים" content={highlights.tenders || 'אין מידע זמין'} />
          </>
        ) : null}

        {/* Footer */}
        <Text style={s.footer} fixed>
          North Star Radar | www.nsradar.co.il | support@nsradar.co.il
        </Text>
      </Page>
    </Document>
  )
}

export async function generateWeeklyReportPdf(data: WeeklyReportPdfData): Promise<Buffer> {
  const buffer = await renderToBuffer(<WeeklyReportDocument {...data} />)
  return Buffer.from(buffer)
}
