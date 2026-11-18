import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapNewsItems, parseDfsTime, selectArticles } from '../dataforseo-news.ts'

test('parseDfsTime handles DataForSEO timestamps', () => {
  assert.equal(parseDfsTime('2026-11-17 08:30:00 +00:00'), '2026-11-17T08:30:00.000Z')
  assert.equal(parseDfsTime('2026-11-17 10:30:00 +02:00'), '2026-11-17T08:30:00.000Z')
  assert.equal(parseDfsTime(''), null)
  assert.equal(parseDfsTime(null), null)
  assert.equal(parseDfsTime('2 hours ago'), null)
})

test('mapNewsItems keeps only articles with a real link and a title', () => {
  const items = mapNewsItems([
    { type: 'news_search', title: 'כתבה', url: 'https://www.ynet.co.il/a/1', source: 'ynet', domain: 'ynet.co.il', timestamp: '2026-11-17 08:30:00 +00:00', snippet: 'תקציר' },
    { type: 'news_search', title: 'ללא קישור', url: '' },
    { type: 'news_search', title: 'קישור לא תקין', url: 'javascript:alert(1)' },
    { type: 'top_stories', items: [{ title: 'סיפור', url: 'https://www.globes.co.il/x', domain: 'globes.co.il' }] },
    { type: 'related_searches', items: ['x'] },
  ])
  assert.deepEqual(items.map(i => i.title), ['כתבה', 'סיפור'])
  assert.equal(items[0].source, 'ynet')
  assert.equal(items[0].publishedAt, '2026-11-17T08:30:00.000Z')
  assert.equal(items[1].source, 'globes.co.il') // falls back to domain
})

test('selectArticles: recent only, de-duplicated, newest first, capped', () => {
  const now = Date.parse('2026-11-18T00:00:00Z')
  const a = (title: string, url: string, iso: string | null) => ({ title, url, source: 's', domain: 'd', publishedAt: iso, snippet: '' })
  const out = selectArticles([
    a('ישנה', 'https://x/1', '2026-08-01T00:00:00Z'),
    a('חדשה', 'https://x/2', '2026-11-17T00:00:00Z'),
    a('חדשה', 'https://x/3', '2026-11-16T00:00:00Z'),      // duplicate title
    a('אמצע', 'https://x/4?utm=1', '2026-11-10T00:00:00Z'),
    a('כפולה', 'https://x/4?utm=1#top', '2026-11-11T00:00:00Z'), // duplicate URL (only the #fragment differs)
    a('ללא תאריך', 'https://x/5', null),
  ], { maxAgeDays: 30, limit: 10, now })
  assert.deepEqual(out.map(o => o.title), ['חדשה', 'אמצע', 'ללא תאריך'])
  assert.equal(selectArticles(out, { maxAgeDays: 30, limit: 1, now }).length, 1)
  // Google News links differ only in the query string — they are distinct articles.
  const g = selectArticles([
    a('א', 'https://google.com/goto?url=AAA', '2026-11-17T00:00:00Z'),
    a('ב', 'https://google.com/goto?url=BBB', '2026-11-16T00:00:00Z'),
  ], { maxAgeDays: 30, limit: 10, now })
  assert.equal(g.length, 2)
})
