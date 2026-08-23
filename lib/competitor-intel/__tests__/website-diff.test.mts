import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanWebsiteText, contentHash, similarity, isMateriallyChanged } from '../website-diff'

const SITE = `
# ניווט: בית | שירותים | צור קשר
אנחנו מלווים משפחות בתהליך המשכנתא מ-2015.
ייעוץ משכנתא ראשונה — ליווי מלא מול כל הבנקים.
מיחזור משכנתא — בדיקה ללא עלות.
המחיר שלנו: 4,500 ₪ לתהליך מלא.
שעות פעילות: ראשון-חמישי 09:00-18:00
כל הזכויות שמורות 2026 | מדיניות פרטיות | תנאי שימוש
אנו משתמשים בעוגיות כדי לשפר את חווית הגלישה
`.trim()

// The same page a week later: only volatile bits moved.
const SITE_NOISE_ONLY = SITE
  .replace('2026', '2027')
  .replace('09:00-18:00', '09:30-18:30')
  .replace('ניווט: בית | שירותים | צור קשר', 'ניווט: בית | שירותים | בלוג | צור קשר')

// A real business change: price up, new service.
const SITE_CHANGED = SITE
  .replace('4,500 ₪', '5,200 ₪')
  .replace('מיחזור משכנתא — בדיקה ללא עלות.',
    'מיחזור משכנתא — בדיקה ללא עלות.\nחדש: ליווי משכנתא לחסרי אזרחות ותושבי חוץ.')

test('cleaning strips chrome (cookies, rights, privacy, terms)', () => {
  const c = cleanWebsiteText(SITE)
  for (const noise of ['עוגיות', 'כל הזכויות שמורות', 'מדיניות פרטיות', 'תנאי שימוש']) {
    assert.ok(!c.includes(noise), `"${noise}" should have been stripped`)
  }
  assert.ok(c.includes('מיחזור משכנתא'), 'real content must survive')
  assert.ok(c.includes('4,500'), 'prices must survive — they are the signal')
})

test('GATE: volatile-only edits normalize to the SAME hash (no LLM call)', () => {
  // Dates, years and times only — nothing a business would call a change.
  const volatileOnly = SITE.replace('2026', '2027').replace('09:00-18:00', '09:30-18:30')
  const a = cleanWebsiteText(SITE)
  const b = cleanWebsiteText(volatileOnly)
  assert.equal(contentHash(a), contentHash(b), 'dates/times/years must normalize away')
  assert.equal(isMateriallyChanged(a, b).changed, false, 'must NOT reach the model')
})

test('GATE: a cosmetic nav/wording tweak stays below the threshold (no LLM call)', () => {
  // A nav item appears — real text, but not a business change. The hash moves;
  // the similarity gate is what has to hold here.
  const a = cleanWebsiteText(SITE)
  const b = cleanWebsiteText(SITE_NOISE_ONLY)
  const g = isMateriallyChanged(a, b)
  assert.equal(g.changed, false, `cosmetic tweak reached the model (similarity ${g.similarity})`)
})

test('GATE: a real business change DOES reach the model', () => {
  const a = cleanWebsiteText(SITE)
  const b = cleanWebsiteText(SITE_CHANGED)   // price 4,500 → 5,200 + a new service
  const g = isMateriallyChanged(a, b)
  assert.equal(g.changed, true, `real change was gated out (similarity ${g.similarity})`)
})

test('GATE: identical text never reaches the model', () => {
  const a = cleanWebsiteText(SITE)
  assert.equal(isMateriallyChanged(a, a).changed, false)
})

test('identical text is identical after cleaning', () => {
  assert.equal(contentHash(cleanWebsiteText(SITE)), contentHash(cleanWebsiteText(SITE)))
  assert.equal(similarity(cleanWebsiteText(SITE), cleanWebsiteText(SITE)), 1)
})

test('reordering the same lines does not trip the gate', () => {
  const lines = cleanWebsiteText(SITE).split('\n')
  const shuffled = [...lines.slice(3), ...lines.slice(0, 3)].join('\n')
  assert.ok(similarity(cleanWebsiteText(SITE), shuffled) >= 0.97, 'shingle similarity ignores order')
})
