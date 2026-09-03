import test from 'node:test'
import assert from 'node:assert/strict'
import { phraseQuery, searchSubject, isPhrase } from '../../keywords'
import { buildCoreModel, wordsOf, norm, wordHit } from '../../match/hebrew-core'

// The real client: רותם קלי דיקור סיני (Chinese acupuncture / TCM).
const CLIENT = { industry: 'רפואה משלימה', description: '' }
const BP = { coreActivity: 'דיקור סיני ורפואה סינית', industryTags: ['רפואה משלימה'] }
const KEYWORDS = ['דיקור סיני', 'רפואה סינית', 'אקופונקטורה']

test('multi-word field terms stay whole (the old bug: joined into a word bag)', () => {
  const old = KEYWORDS.slice(0, 3).join(' ')          // what the code used to build
  assert.equal(old, 'דיקור סיני רפואה סינית אקופונקטורה')
  const q = phraseQuery(KEYWORDS, 3)
  assert.ok(q.includes('"דיקור סיני"'), `phrase must be quoted, got: ${q}`)
  assert.ok(q.includes('"רפואה סינית"'))
  assert.ok(!/(^|\s)סיני(\s|$)/.test(q), `bare "סיני" must never stand alone: ${q}`)
})

test('single words are not needlessly quoted', () => {
  assert.equal(phraseQuery(['אקופונקטורה'], 1), 'אקופונקטורה')
  assert.equal(isPhrase('אקופונקטורה'), false)
  assert.equal(isPhrase('דיקור סיני'), true)
})

test('the query is anchored by the field, not the country', () => {
  const subject = searchSubject(KEYWORDS, CLIENT, BP, 3)
  assert.ok(subject.includes('"דיקור סיני"'))
  assert.ok(subject.includes('רפואה'), `industry anchor missing: ${subject}`)
  assert.ok(!subject.includes('סין '), 'must not introduce the bare country term')
})

test('the anchor is not duplicated when the keywords already carry it', () => {
  const subject = searchSubject(['רפואה סינית'], CLIENT, BP, 1)
  assert.equal((subject.match(/רפואה/g) || []).length, 1, `duplicated anchor: ${subject}`)
})

test('a client with no keywords still gets a usable subject', () => {
  assert.equal(searchSubject([], CLIENT, BP, 3), 'רפואה משלימה')
})

// ── The conferences relevance gate ────────────────────────────────────────
const { kwInfo } = buildCoreModel(KEYWORDS)
const singleTokenHit = (words: string[]) => kwInfo.some(k => !k.multi && wordHit(words, k.coreTokens))
const phraseHit = (text: string) => kwInfo.some(k => k.multi && text.includes(k.norm))
const matches = (title: string) => phraseHit(norm(title)) || singleTokenHit(wordsOf(title))

test('a CHINA conference no longer matches a Chinese-medicine clinic', () => {
  for (const t of [
    'כנס הכלכלה הסינית 2026',
    'יחסי ישראל–סין: הזדמנויות מסחר',
    'פורום המשקיעים הסיני',
  ]) assert.equal(matches(t), false, `false positive on: "${t}"`)
})

test('real field conferences still match', () => {
  for (const t of [
    'הכנס הישראלי לדיקור סיני',
    'רפואה סינית — כנס מקצועי שנתי',
    'אקופונקטורה בפרקטיקה קלינית',
  ]) assert.equal(matches(t), true, `lost a real match: "${t}"`)
})
