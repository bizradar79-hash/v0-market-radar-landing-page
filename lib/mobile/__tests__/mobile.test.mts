import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compareFeed, decodeCursor, encodeCursor, isAfterCursor } from '../feed.ts'
import { requireHttps } from '../core.ts'

test('cursor round-trips and rejects garbage', () => {
  const c = { d: '2026-10-01T10:00:00.000Z', k: 'news:abc' }
  assert.deepEqual(decodeCursor(encodeCursor(c)), c)
  assert.equal(decodeCursor('not-a-cursor'), null)
  assert.equal(decodeCursor(Buffer.from('{"d":"nope","k":"x"}').toString('base64url')), null)
  assert.equal(decodeCursor(null), null)
})

test('feed order: newest first, id desc on ties; pages never overlap or skip', () => {
  const items = [
    { date: '2026-10-02T00:00:00.000Z', id: 'news:1' },
    { date: '2026-10-01T00:00:00.000Z', id: 'tender:9' },
    { date: '2026-10-01T00:00:00.000Z', id: 'news:5' },
    { date: '2026-09-30T00:00:00.000Z', id: 'lead:2' },
  ].sort(compareFeed)
  assert.deepEqual(items.map(i => i.id), ['news:1', 'tender:9', 'news:5', 'lead:2'])
  const page1 = items.slice(0, 2)
  const last = page1[page1.length - 1]
  const page2 = items.filter(i => isAfterCursor(i, { d: last.date, k: last.id }))
  assert.deepEqual(page2.map(i => i.id), ['news:5', 'lead:2'])
})

const req = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers })

test('HTTPS gate: plain HTTP rejected, HTTPS and localhost allowed', async () => {
  const res = requireHttps(req('http://api.example.com/api/mobile/feed', { host: 'api.example.com', 'x-forwarded-proto': 'http' }))
  assert.equal(res?.status, 403)
  assert.equal((await res!.json()).error.code, 'https_required')
  assert.equal(requireHttps(req('http://x/api', { host: 'nsradar.co.il', 'x-forwarded-proto': 'https' })), null)
  assert.equal(requireHttps(req('http://localhost:3000/api', { host: 'localhost:3000' })), null)
})
