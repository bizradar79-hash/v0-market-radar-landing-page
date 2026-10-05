import test from 'node:test'
import assert from 'node:assert/strict'
import { errorDetails, describeFailure } from '../error-report'

// ── Server side: errorDetails ─────────────────────────────────────────────
test('Resend error shape is captured (name, message, statusCode)', () => {
  const resendErr = { name: 'validation_error', message: 'The nsradar.co.il domain is not verified.', statusCode: 403 }
  assert.deepEqual(errorDetails(resendErr), resendErr)
})

test('Supabase PostgrestError shape is captured (code, details, hint)', () => {
  const pg = { message: 'column companies.is_demo does not exist', code: '42703', details: null, hint: 'Perhaps you meant…' }
  assert.deepEqual(errorDetails(pg), { message: pg.message, code: '42703', hint: 'Perhaps you meant…' })
})

test('a thrown Error keeps its message', () => {
  const d = errorDetails(new TypeError('fetch failed'))
  assert.equal(d.message, 'fetch failed')
  assert.equal(d.name, 'TypeError')
})

test('nested objects and unknown fields are not copied (no header/credential leakage)', () => {
  const d = errorDetails({ message: 'x', headers: { authorization: 'Bearer secret' }, config: { apiKey: 'k' } })
  assert.deepEqual(d, { message: 'x' })
})

test('null / string / number inputs are safe', () => {
  assert.deepEqual(errorDetails(null), {})
  assert.deepEqual(errorDetails('boom'), { message: 'boom' })
  assert.deepEqual(errorDetails(42), { message: '42' })
})

// ── Client side: describeFailure ──────────────────────────────────────────
test('THE REPORTED BUG: a 500 with no JSON body still produces a message', () => {
  const r = describeFailure(500, 'Internal Server Error', '')
  assert.ok(r.summary.includes('HTTP 500'))
  assert.ok(r.summary.length > 'HTTP 500'.length + 3, `summary is not explanatory: "${r.summary}"`)
})

test('an HTML error page is reduced to readable text', () => {
  const r = describeFailure(504, 'Gateway Timeout', '<html><body><h1>504</h1><p>FUNCTION_INVOCATION_TIMEOUT</p></body></html>')
  assert.ok(r.summary.includes('תם הזמן'))
  assert.ok(r.full.includes('FUNCTION_INVOCATION_TIMEOUT'), 'the platform error code must survive')
  assert.ok(!r.full.includes('<h1>'), 'markup should be stripped')
})

test('a 404 points at an un-deployed route', () => {
  assert.ok(describeFailure(404, 'Not Found', 'Not Found').summary.includes('הפריסה'))
})

test('a structured error shows message, stage, provider code and missing env', () => {
  const body = JSON.stringify({
    error: 'Resend דחה את השליחה: The nsradar.co.il domain is not verified.',
    stage: 'send',
    details: { name: 'validation_error', statusCode: 403 },
    requestId: 'sre-abc-12345',
    config: { RESEND_API_KEY: true, SUPABASE_SERVICE_ROLE_KEY: true },
  })
  const r = describeFailure(502, 'Bad Gateway', body)
  for (const piece of ['not verified', 'שלב: send', 'סוג: validation_error', 'קוד: 403', 'HTTP 502'])
    assert.ok(r.summary.includes(piece), `summary missing "${piece}": ${r.summary}`)
  assert.ok(r.full.includes('sre-abc-12345'), 'requestId must be in the copyable details')
})

test('a missing env var is called out explicitly', () => {
  const body = JSON.stringify({ error: 'x', stage: 'check_config', config: { RESEND_API_KEY: false, SUPABASE_SERVICE_ROLE_KEY: true } })
  assert.ok(describeFailure(500, '', body).summary.includes('חסר בסביבה: RESEND_API_KEY'))
})
