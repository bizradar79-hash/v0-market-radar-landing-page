import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveReviewsPaths, isUsable, type ReviewsLike, type ResolveDeps } from '../resolve-reviews'

const ok = (rating: number, count: number): ReviewsLike => ({
  found: true, rating, reviewsCount: count, reviews: new Array(Math.min(count, 20)).fill({}),
  cid: '13294732576479516349', title: 'לימון ייעוץ משכנתאות', costUSD: 0.003,
})
const fail = (error: string): ReviewsLike => ({
  found: false, rating: null, reviewsCount: null, reviews: [], costUSD: 0.002, error,
})

function deps(over: Partial<ResolveDeps> = {}): ResolveDeps {
  return {
    byId: async () => fail('unexpected byId'),
    byQuery: async () => fail('no_maps_results'),
    parseMapsUrl: async () => ({ error: 'no_id_in_url' }),
    webSearch: async () => [],
    queries: ['לימון ייעוץ משכנתאות רמת גן', 'לימון משכנתאות'],
    webQuery: 'לימון ייעוץ משכנתאות רמת גן',
    ...over,
  }
}

// ── TEST 1 — the exact production scenario ────────────────────────────────
// PATH 1 (ai-maps-url) returned rating=5 / count=143, and the later name-search
// paths failed. The saved record must be the 143-review SUCCESS.
test('prod scenario: ai-maps-url succeeds, later name-search paths fail → success persists', async () => {
  const calls: string[] = []
  const out = await resolveReviewsPaths(deps({
    aiMapsUrl: 'https://www.google.com/maps?cid=13294732576479516349',
    parseMapsUrl: async () => ({ cid: '13294732576479516349' }),
    byId: async () => { calls.push('byId'); return ok(5, 143) },
    byQuery: async (q) => { calls.push(`byQuery:${q}`); return fail('no_confident_name_match') },
  }))

  assert.equal(out.reviews.found, true, 'must persist found=true')
  assert.equal(out.reviews.rating, 5)
  assert.equal(out.reviews.reviewsCount, 143, 'the 143 reviews must survive')
  assert.equal(out.resolvedBy, 'ai-maps-url')
  assert.ok(!out.passes.includes('no_confident_name_match'),
    `passes must not report a failure for a successful run — got "${out.passes}"`)
  // INVARIANT 1: no later path may even RUN after a success.
  assert.deepEqual(calls, ['byId'], 'name-search paths must not run after a success')
})

// ── TEST 2 — ai-maps-url fails, Maps search succeeds → that success persists ─
test('ai-maps-url fails → Maps top-result success is the saved outcome', async () => {
  const out = await resolveReviewsPaths(deps({
    aiMapsUrl: 'https://www.google.com/maps/search/לימון',
    parseMapsUrl: async () => ({ error: 'no_id_in_url' }),
    byQuery: async (q) =>
      q === 'לימון משכנתאות' ? { ...ok(4.8, 87), viaTopResult: true } : fail('no_maps_results'),
  }))

  assert.equal(out.reviews.found, true)
  assert.equal(out.reviews.reviewsCount, 87)
  assert.equal(out.resolvedBy, 'maps("לימון משכנתאות")')
  assert.ok(out.passes.includes('ai-maps-url:no_id_in_url'), 'trail records the failed first path')
})

// ── TEST 3 — every path fails → "not found" is legitimate ─────────────────
test('all paths fail → found=false (the only legitimate not-found)', async () => {
  const out = await resolveReviewsPaths(deps({
    aiMapsUrl: undefined,
    byQuery: async () => fail('no_maps_results'),
    webSearch: async () => ['https://example.com/not-maps'],
  }))

  assert.equal(out.reviews.found, false)
  assert.equal(out.resolvedBy, '')
  assert.ok(out.passes.includes('web-search:none'), `expected full trail, got "${out.passes}"`)
})

// ── TEST 4 — cached cid short-circuits everything ─────────────────────────
test('cached cid wins and nothing else runs', async () => {
  const calls: string[] = []
  const out = await resolveReviewsPaths(deps({
    cachedCid: '999',
    byId: async () => { calls.push('byId'); return ok(4.9, 119) },
    aiMapsUrl: 'https://www.google.com/maps?cid=111',
    parseMapsUrl: async () => { calls.push('parse'); return { cid: '111' } },
    byQuery: async () => { calls.push('byQuery'); return fail('no_maps_results') },
  }))

  assert.equal(out.reviews.reviewsCount, 119)
  assert.equal(out.resolvedBy, 'cached-cid')
  assert.deepEqual(calls, ['byId'])
})

// ── TEST 5 — a "found" with no usable data is NOT a success ───────────────
test('found=true but empty payload is not accepted as a success', async () => {
  const empty: ReviewsLike = { found: true, rating: null, reviewsCount: 0, reviews: [], costUSD: 0 }
  assert.equal(isUsable(empty), false)
  const out = await resolveReviewsPaths(deps({
    cachedCid: 'x',
    byId: async () => empty,
    byQuery: async (q) => (q === 'לימון משכנתאות' ? ok(4.2, 31) : fail('no_maps_results')),
  }))
  assert.equal(out.reviews.reviewsCount, 31, 'falls through to a real result')
  assert.equal(out.resolvedBy, 'maps("לימון משכנתאות")')
})

// ── TEST 6 — cost accumulates across attempted paths ──────────────────────
test('cost sums every path attempted, including the failures', async () => {
  const out = await resolveReviewsPaths(deps({
    byQuery: async (q) => (q === 'לימון משכנתאות' ? ok(5, 143) : fail('no_maps_results')),
  }))
  assert.equal(out.reviews.reviewsCount, 143)
  assert.ok(out.costUSD > 0.003, `expected failure+success cost, got ${out.costUSD}`)
})

// ── TEST 7 — the deadline must not DISCARD an already-won success ─────────
// This is the regression that caused the bug: a slow run had resolved 143
// reviews when the caller's timer fired, and the completed result was thrown
// away. A deadline may only stop work that has not STARTED.
test('deadline does not discard a success already obtained', async () => {
  const out = await resolveReviewsPaths(deps({
    cachedCid: '13294732576479516349',
    // Deadline already passed: no NEW path may start...
    deadlineAt: Date.now() - 1,
    byId: async () => ok(5, 143),
    byQuery: async () => { throw new Error('must not run past the deadline') },
    webSearch: async () => { throw new Error('must not run past the deadline') },
  }))

  // ...but PATH 0 ran before it and its success must survive intact.
  assert.equal(out.reviews.found, true)
  assert.equal(out.reviews.reviewsCount, 143, 'a completed result must never be discarded')
  assert.equal(out.resolvedBy, 'cached-cid')
})

// ── TEST 8 — past the deadline with nothing found: return, never throw ────
test('deadline with no success returns found=false instead of throwing', async () => {
  const out = await resolveReviewsPaths(deps({
    aiMapsUrl: 'https://www.google.com/maps?cid=1',
    deadlineAt: Date.now() - 1,
    parseMapsUrl: async () => { throw new Error('must not run past the deadline') },
    byQuery: async () => { throw new Error('must not run past the deadline') },
    webSearch: async () => { throw new Error('must not run past the deadline') },
  }))

  assert.equal(out.reviews.found, false)
  assert.equal(out.resolvedBy, '')
  assert.ok(out.passes.includes('deadline'), `trail should record the deadline, got "${out.passes}"`)
})

// ── TEST 9 — the persisted status always equals the actual outcome ────────
// Guards INVARIANT 3: what we save must describe what we found.
test('passes trail always describes the returned outcome', async () => {
  const success = await resolveReviewsPaths(deps({
    aiMapsUrl: 'https://www.google.com/maps?cid=13294732576479516349',
    parseMapsUrl: async () => ({ cid: '13294732576479516349' }),
    byId: async () => ok(5, 143),
    byQuery: async () => fail('no_confident_name_match'),
  }))
  assert.equal(success.reviews.found, true)
  assert.equal(success.passes, 'ai-maps-url',
    `a successful run must not carry failure labels — got "${success.passes}"`)

  const failure = await resolveReviewsPaths(deps({
    byQuery: async () => fail('no_maps_results'),
    webSearch: async () => [],
  }))
  assert.equal(failure.reviews.found, false)
  assert.ok(failure.passes.length > 0 && failure.resolvedBy === '')
})
