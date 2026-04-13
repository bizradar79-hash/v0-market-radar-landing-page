const HEBREW_MONTHS = [
  'ינואר','פברואר','מרץ','אפריל','מאי','יוני',
  'יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר',
]

function dateWithOffset(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/**
 * Resolves date template variables in a prompt string.
 * Supported variables:
 *   {{today}}       → e.g. 13/04/2026
 *   {{today+7}}     → 7 days from now
 *   {{today-30}}    → 30 days ago
 *   {{month}}       → e.g. אפריל 2026
 *   {{year}}        → e.g. 2026
 */
export function resolveDateVars(prompt: string): string {
  const now = new Date()
  return prompt
    .replace(/\{\{today\}\}/g, dateWithOffset(0))
    .replace(/\{\{today([+-]\d+)\}\}/g, (_, offset) => dateWithOffset(parseInt(offset, 10)))
    .replace(/\{\{month\}\}/g, `${HEBREW_MONTHS[now.getMonth()]} ${now.getFullYear()}`)
    .replace(/\{\{year\}\}/g, String(now.getFullYear()))
}
