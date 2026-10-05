// "Your weekly report is ready" — the email an admin sends a client by hand.
//
// It carries ONE link: the client's permanent web report (/r/[token]). No admin
// URLs, no app-internal paths. Table-based with inline styles throughout,
// because that is what email clients actually render; RTL is set on every
// cell, not just the <html>, since Outlook ignores inherited direction.
//
// Pure functions, no I/O — the route does the sending, this only renders.

const BRAND = '#0D9488'
const BRAND_DARK = '#0F172A'

/** Company names are client-entered text — never trust them inside HTML. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** A subject is a single header line: strip anything that could break it. */
function headerSafe(s: string): string {
  return s.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
}

export interface ReportLinkEmailInput {
  companyName: string
  reportUrl: string
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

export function renderReportLinkEmail({ companyName, reportUrl }: ReportLinkEmailInput): RenderedEmail {
  const name = headerSafe(companyName || '') || 'העסק שלך'
  const safeName = escapeHtml(name)
  const safeUrl = escapeHtml(reportUrl)

  const subject = `הדוח השבועי שלך מוכן — ${name}`

  const cell = 'direction: rtl; text-align: right; font-family: Arial, Helvetica, sans-serif;'

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; direction: rtl;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f1f5f9;">
    <tr>
      <td align="center" style="padding: 24px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width: 560px; width: 100%;">

          <!-- Header -->
          <tr>
            <td style="background-color: ${BRAND}; border-radius: 16px 16px 0 0; padding: 28px 24px; text-align: center; font-family: Arial, Helvetica, sans-serif;">
              <div style="font-size: 20px; font-weight: 700; color: #ffffff;">North Star Radar</div>
              <div style="margin-top: 6px; font-size: 13px; color: #ccfbf1;">מודיעין שוק שבועי לעסק שלך</div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color: #ffffff; padding: 32px 28px; ${cell}">
              <p style="margin: 0; font-size: 18px; font-weight: 700; color: ${BRAND_DARK}; ${cell}">
                שלום ${safeName},
              </p>
              <p style="margin: 14px 0 0; font-size: 15px; line-height: 1.75; color: #374151; ${cell}">
                הדוח השבועי של <strong>${safeName}</strong> מוכן. ריכזנו בשבילך את מה שקרה השבוע
                בשוק שלך — ומה כדאי לעשות עם זה.
              </p>

              <p style="margin: 22px 0 8px; font-size: 14px; font-weight: 700; color: ${BRAND_DARK}; ${cell}">
                מה מחכה לך בדוח:
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr><td style="padding: 4px 0; font-size: 14px; line-height: 1.6; color: #374151; ${cell}">🔍 &nbsp;מה המתחרים שלך פרסמו ומה כותבים עליהם בגוגל</td></tr>
                <tr><td style="padding: 4px 0; font-size: 14px; line-height: 1.6; color: #374151; ${cell}">🤖 &nbsp;איך העסק שלך מופיע בגוגל ובמנועי AI</td></tr>
                <tr><td style="padding: 4px 0; font-size: 14px; line-height: 1.6; color: #374151; ${cell}">🎯 &nbsp;הזדמנויות ופעולות מומלצות לשבוע הקרוב</td></tr>
              </table>

              <!-- CTA -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top: 28px;">
                <tr>
                  <td align="center">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="background-color: ${BRAND}; border-radius: 10px;">
                          <a href="${safeUrl}" target="_blank"
                             style="display: inline-block; padding: 14px 34px; font-family: Arial, Helvetica, sans-serif; font-size: 15px; font-weight: 700; color: #ffffff; text-decoration: none;">
                            לצפייה בדוח השבועי ←
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Plain fallback link, for clients that strip buttons -->
              <p style="margin: 20px 0 0; font-size: 12px; line-height: 1.6; color: #9ca3af; text-align: center; font-family: Arial, Helvetica, sans-serif;">
                אם הכפתור לא עובד, אפשר להעתיק את הקישור:<br>
                <a href="${safeUrl}" style="color: ${BRAND}; word-break: break-all;">${safeUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-radius: 0 0 16px 16px; padding: 18px 24px; text-align: center; font-family: Arial, Helvetica, sans-serif;">
              <p style="margin: 0; font-size: 12px; line-height: 1.6; color: #94a3b8;">
                הקישור הזה אישי וקבוע לדוח שלך — אפשר לשמור אותו.<br>
                שאלות? פשוט עונים למייל הזה.
              </p>
              <p style="margin: 8px 0 0; font-size: 11px; color: #cbd5e1;">North Star Radar · nsradar.co.il</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  // Plain-text alternative: improves deliverability and serves text-only clients.
  const text = [
    `שלום ${name},`,
    '',
    `הדוח השבועי של ${name} מוכן.`,
    'ריכזנו בשבילך את מה שקרה השבוע בשוק שלך — ומה כדאי לעשות עם זה.',
    '',
    'מה מחכה לך בדוח:',
    '• מה המתחרים שלך פרסמו ומה כותבים עליהם בגוגל',
    '• איך העסק שלך מופיע בגוגל ובמנועי AI',
    '• הזדמנויות ופעולות מומלצות לשבוע הקרוב',
    '',
    `לצפייה בדוח: ${reportUrl}`,
    '',
    'הקישור הזה אישי וקבוע לדוח שלך — אפשר לשמור אותו.',
    'שאלות? פשוט עונים למייל הזה.',
    '',
    'North Star Radar · nsradar.co.il',
  ].join('\n')

  return { subject, html, text }
}
