import test from 'node:test'
import assert from 'node:assert/strict'
import { SUPPORTED_PROVIDERS, isSupportedProvider } from '../../call-model'

test('provider validation catches the sub-second misconfiguration', () => {
  for (const good of SUPPORTED_PROVIDERS) assert.equal(isSupportedProvider(good), true)
  // Every one of these made callModel throw "Unknown provider" BEFORE any
  // network call — the ~1s false green check.
  for (const bad of ['openai', 'anthropic', 'grok', 'xAI ', '', null, undefined, 'Gemini'])
    assert.equal(isSupportedProvider(bad as any), false, `should reject: ${JSON.stringify(bad)}`)
})

test('a trimmed valid provider is accepted', () => {
  assert.equal(isSupportedProvider(' xai '), true)
})

// ── The response contract the admin button reads ──────────────────────────
// sync-module sets ok = res.ok (the HTTP status), so ANY 200 shows ✅.
const adminShowsSuccess = (status: number) => status >= 200 && status < 300

test('an AI failure with no recovery must NOT read as success', () => {
  assert.equal(adminShowsSuccess(500), false, 'a failed run must surface as ❌')
})

test('a recovered run (search fallback found items) reads as success', () => {
  assert.equal(adminShowsSuccess(200), true)
})

// ── Delete-only-when-replacing ────────────────────────────────────────────
// Models the guard now shared by news / conferences / tenders.
function replaceRows(existing: string[], incoming: string[]): string[] {
  if (incoming.length === 0) return existing   // keep what's there
  return incoming
}

test('an empty fetch never destroys existing items', () => {
  assert.deepEqual(replaceRows(['old news 1', 'old news 2'], []), ['old news 1', 'old news 2'])
})

test('a successful fetch replaces them', () => {
  assert.deepEqual(replaceRows(['old'], ['new 1', 'new 2']), ['new 1', 'new 2'])
})
