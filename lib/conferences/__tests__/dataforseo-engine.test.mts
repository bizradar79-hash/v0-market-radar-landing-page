import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildConferenceQueries, candidatesFromItems, mapExtracted } from '../dataforseo-engine.ts'

test('queries: quoted field phrase + industry anchor; next year from September', () => {
  assert.deepEqual(buildConferenceQueries(['פטריות מרפא', 'ריישי'], 'תוספי תזונה', new Date('2026-11-18T00:00:00Z')),
    ['כנס "פטריות מרפא" 2026 OR 2027', 'כנס תוספי תזונה 2026 OR 2027', 'תערוכה תוספי תזונה 2026 OR 2027'])
  assert.deepEqual(buildConferenceQueries(['ריישי'], '', new Date('2026-03-01T00:00:00Z')), ['כנס ריישי 2026'])
})

test('candidates come from events blocks and organic results', () => {
  const c = candidatesFromItems([
    { type: 'events', items: [{ type: 'events_element', title: 'כנס א', snippet: 's', url: 'https://a' }] },
    { type: 'organic', title: 'כנס ב', description: 'd', url: 'https://b' },
    { type: 'video', title: 'וידאו', url: 'https://v' },
  ])
  assert.deepEqual(c.map(x => x.title), ['כנס א', 'כנס ב'])
})

test('mapExtracted: keeps real events only, URL always from Google, normalises dates', () => {
  const cands = [
    { title: 'METABOLIX 2026', snippet: '', url: 'https://google.com/goto?url=A' },
    { title: 'קורס תוספים', snippet: '', url: 'https://c' },
    { title: 'כתבה', snippet: '', url: 'https://d' },
  ]
  const out = mapExtracted([
    { i: 0, kind: 'conference', name: 'METABOLIX 2026', date: '2026-12-03', location: 'תל אביב', url: 'https://invented.example' },
    { i: 1, kind: 'course', name: 'קורס' },
    { i: 2, kind: 'article', name: 'כתבה' },
    { i: 9, kind: 'conference', name: 'אין מועמד כזה' },
  ], cands)
  assert.equal(out.length, 1)
  assert.equal(out[0].url, 'https://google.com/goto?url=A')
  assert.equal(out[0].datePrecision, 'day')
  assert.equal(mapExtracted([{ i: 0, kind: 'expo', date: 'בקרוב' }], cands)[0].date, '')
  assert.equal(mapExtracted([{ i: 0, kind: 'expo', date: '2027-03' }], cands)[0].datePrecision, 'month')
})
