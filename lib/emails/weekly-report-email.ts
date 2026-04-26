interface WeeklyReportEmailData {
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
    executive_summary?: string
    [key: string]: any
  }
}

const BRAND_COLOR = '#0d9488'
const BRAND_DARK = '#0f766e'

function sectionRow(icon: string, title: string, content: string): string {
  return `
    <tr>
      <td style="padding: 0 0 16px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="direction: rtl; text-align: right; font-family: Arial, Helvetica, sans-serif;">
                    <span style="font-size: 20px; margin-left: 8px;">${icon}</span>
                    <span style="font-size: 14px; font-weight: 700; color: ${BRAND_DARK};">${title}</span>
                  </td>
                </tr>
                <tr>
                  <td style="direction: rtl; text-align: right; font-family: Arial, Helvetica, sans-serif; padding-top: 10px; font-size: 14px; line-height: 1.7; color: #374151;">
                    ${content}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>`
}

export function renderWeeklyReportEmail(data: WeeklyReportEmailData): string {
  const { companyName, weekDate, highlights, report } = data

  const executiveSummary = report?.executive_summary
    ? `<tr>
        <td style="padding: 0 0 20px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="background: linear-gradient(135deg, ${BRAND_COLOR}, ${BRAND_DARK}); border-radius: 12px; padding: 24px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td style="direction: rtl; text-align: right; font-family: Arial, Helvetica, sans-serif;">
                      <span style="font-size: 14px; font-weight: 700; color: #fcd34d;">&#11088; תמצית מנהלים</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="direction: rtl; text-align: right; font-family: Arial, Helvetica, sans-serif; padding-top: 12px; font-size: 14px; line-height: 1.7; color: #ffffff;">
                      ${report.executive_summary}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : ''

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>דוח שבועי - ${companyName}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: Arial, Helvetica, sans-serif; direction: rtl;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f1f5f9;">
    <tr>
      <td align="center" style="padding: 24px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; width: 100%;">

          <!-- Header -->
          <tr>
            <td style="background-color: ${BRAND_COLOR}; border-radius: 16px 16px 0 0; padding: 32px 24px; text-align: center;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; font-family: Arial, Helvetica, sans-serif;">
                    <div style="font-size: 28px; margin-bottom: 8px;">&#128202;</div>
                    <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #ffffff;">North Star Radar</h1>
                    <p style="margin: 8px 0 0; font-size: 13px; color: #ccfbf1;">דוח שבועי | ${weekDate}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color: #ffffff; padding: 32px 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">

                <!-- Greeting -->
                <tr>
                  <td style="direction: rtl; text-align: right; font-family: Arial, Helvetica, sans-serif; padding-bottom: 24px;">
                    <p style="margin: 0; font-size: 18px; font-weight: 700; color: #111827;">שלום ${companyName},</p>
                    <p style="margin: 8px 0 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
                      הנה הדוח השבועי שלך מתאריך ${weekDate}. להלן סיכום התובנות העיקריות:
                    </p>
                  </td>
                </tr>

                ${executiveSummary}

                <!-- Sections -->
                ${sectionRow('&#128202;', 'מודיעין מתחרים', highlights.competitors || 'אין מידע זמין')}
                ${sectionRow('&#128200;', 'טרנדים בשוק', highlights.trends || 'אין מידע זמין')}
                ${sectionRow('&#128240;', 'חדשות מהענף', highlights.news || 'אין מידע זמין')}
                ${sectionRow('&#127914;', 'כנסים קרובים', highlights.conferences || 'אין מידע זמין')}
                ${sectionRow('&#128203;', 'מכרזים', highlights.tenders || 'אין מידע זמין')}

                <!-- CTA -->
                <tr>
                  <td style="padding: 24px 0 0; text-align: center;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
                      <tr>
                        <td style="background-color: ${BRAND_COLOR}; border-radius: 8px;">
                          <a href="https://www.nsradar.co.il/app/reports"
                             style="display: inline-block; padding: 14px 32px; font-family: Arial, Helvetica, sans-serif; font-size: 14px; font-weight: 700; color: #ffffff; text-decoration: none;">
                            &#128279; צפה בדוח המלא באתר
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin: 16px 0 0; font-size: 12px; color: #9ca3af; font-family: Arial, Helvetica, sans-serif;">
                      הדוח המלא מצורף כקובץ PDF
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-radius: 0 0 16px 16px; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; font-family: Arial, Helvetica, sans-serif;">
                    <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                      North Star Radar — מודיעין עסקי חכם
                    </p>
                    <p style="margin: 6px 0 0; font-size: 11px; color: #d1d5db;">
                      <a href="mailto:support@nsradar.co.il" style="color: #9ca3af; text-decoration: none;">support@nsradar.co.il</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
