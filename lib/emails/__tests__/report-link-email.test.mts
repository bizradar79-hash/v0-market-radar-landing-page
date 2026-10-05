import test from 'node:test'
import assert from 'node:assert/strict'
import { renderReportLinkEmail, escapeHtml } from '../report-link-email'

const URL = 'https://www.nsradar.co.il/r/3f9a1c7e2b4d6f8a0c1e3b5d7f9a1c3e5b7d9f1a3c5e7b9d'

test('subject is personalized with the company name', () => {
  const { subject } = renderReportLinkEmail({ companyName: 'רותם קלי דיקור סיני', reportUrl: URL })
  assert.equal(subject, 'הדוח השבועי שלך מוכן — רותם קלי דיקור סיני')
})

test('body greets the company and links to ITS report', () => {
  const { html, text } = renderReportLinkEmail({ companyName: 'משכנתא פלוס', reportUrl: URL })
  assert.ok(html.includes('שלום משכנתא פלוס'))
  assert.ok(html.includes(`href="${URL}"`), 'CTA must point at the client report')
  assert.ok(text.includes(URL), 'plain-text part must carry the link too')
})

test('the ONLY destination is the client report — no admin or app-internal links', () => {
  const { html } = renderReportLinkEmail({ companyName: 'x', reportUrl: URL })
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1])
  assert.ok(hrefs.length > 0)
  for (const h of hrefs) assert.equal(h, URL, `unexpected link in email: ${h}`)
  assert.ok(!/\/admin|\/app\//.test(html), 'no admin / in-app paths may appear')
})

test('RTL is declared on the document and the content cells', () => {
  const { html } = renderReportLinkEmail({ companyName: 'x', reportUrl: URL })
  assert.ok(html.includes('<html lang="he" dir="rtl">'))
  assert.ok((html.match(/direction: rtl/g) || []).length >= 5, 'Outlook ignores inherited direction — set it per cell')
})

test('a hostile company name cannot inject markup', () => {
  const evil = '<img src=x onerror="alert(1)"><a href="https://phish.example">לחץ</a>'
  const { html } = renderReportLinkEmail({ companyName: evil, reportUrl: URL })
  assert.ok(!html.includes('<img src=x'), 'raw tag leaked into the email')
  assert.ok(!html.includes('href="https://phish.example"'), 'injected link leaked into the email')
  assert.ok(html.includes('&lt;img'), 'name should appear escaped')
})

test('a name with newlines cannot break the subject header', () => {
  const { subject } = renderReportLinkEmail({ companyName: 'Acme\r\nBcc: victim@example.com', reportUrl: URL })
  assert.ok(!/[\r\n]/.test(subject), `header injection: ${JSON.stringify(subject)}`)
})

test('a missing company name degrades gracefully', () => {
  const { subject, html } = renderReportLinkEmail({ companyName: '', reportUrl: URL })
  assert.equal(subject, 'הדוח השבועי שלך מוכן — העסק שלך')
  assert.ok(html.includes('שלום העסק שלך'))
})

test('escapeHtml covers the five significant characters', () => {
  assert.equal(escapeHtml(`<a href="x" title='y'>&</a>`), '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;')
})
