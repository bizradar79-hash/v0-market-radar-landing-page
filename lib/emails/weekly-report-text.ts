interface WeeklyReportTextData {
  companyName: string
  weekDate: string
  highlights: {
    competitors?: string
    trends?: string
    news?: string
    conferences?: string
    tenders?: string
  }
  report?: {
    trends?: {
      keyword_intel?: { keyword: string; searchVolume: number; direction?: string; directionHe?: string; changePct?: number; competitionHe?: string; cpc?: number }[]
      keyword_opportunities?: { keyword: string; searchVolume: number; direction?: string; directionHe?: string }[]
    }
    [key: string]: any
  }
}

function buildKeywordText(report?: WeeklyReportTextData['report']): string {
  const intel = report?.trends?.keyword_intel
  if (!Array.isArray(intel) || intel.length === 0) return ''
  const fmtPct = (v?: number) => {
    const n = typeof v === 'number' ? v : 0
    return `${n > 0 ? '+' : ''}${n}%`
  }
  const fmtVol = (v?: number) => (typeof v === 'number' ? v : 0).toLocaleString('he-IL')
  const lines = intel.slice(0, 6).map((k) => {
    const dirHe = k.directionHe || (k.direction === 'rising' ? 'עולה' : k.direction === 'falling' ? 'יורד' : 'יציב')
    let line = `  - "${k.keyword}": ${fmtVol(k.searchVolume)} חיפושים/חודש, ${dirHe} ${fmtPct(k.changePct)}`
    if (typeof k.cpc === 'number' && k.cpc > 0) line += `, CPC $${k.cpc}`
    return line
  })
  for (const o of (report?.trends?.keyword_opportunities || []).slice(0, 3)) {
    const dirHe = o.directionHe || (o.direction === 'rising' ? 'עולה' : o.direction === 'falling' ? 'יורד' : 'יציב')
    lines.push(`  - הזדמנות: "${o.keyword}" — ${fmtVol(o.searchVolume)} חיפושים/חודש, ${dirHe}`)
  }
  return `\nמילות מפתח ומגמות:\n${lines.join('\n')}\n`
}

export function renderWeeklyReportText({ companyName, weekDate, highlights, report }: WeeklyReportTextData): string {
  const keywordText = buildKeywordText(report)
  return `שלום ${companyName},

הנה הדוח השבועי שלך מתאריך ${weekDate}.

מודיעין מתחרים: ${highlights.competitors || 'אין מידע זמין'}
${keywordText}טרנדים בשוק: ${highlights.trends || 'אין מידע זמין'}
חדשות מהענף: ${highlights.news || 'אין מידע זמין'}
כנסים קרובים: ${highlights.conferences || 'אין מידע זמין'}
מכרזים: ${highlights.tenders || 'אין מידע זמין'}

הדוח המלא מצורף כקובץ PDF.

לעוד פרטים: https://www.nsradar.co.il/app/reports
תמיכה: support@nsradar.co.il

--
North Star Radar | nsradar.co.il
לביטול הרשמה: support@nsradar.co.il`
}
