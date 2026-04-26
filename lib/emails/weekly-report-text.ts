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
}

export function renderWeeklyReportText({ companyName, weekDate, highlights }: WeeklyReportTextData): string {
  return `שלום ${companyName},

הנה הדוח השבועי שלך מתאריך ${weekDate}.

מודיעין מתחרים: ${highlights.competitors || 'אין מידע זמין'}
טרנדים בשוק: ${highlights.trends || 'אין מידע זמין'}
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
