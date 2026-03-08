#!/usr/bin/env node
/**
 * test-and-fix.mjs
 * Gets a Bearer token from /api/get-test-token, then tests all 7 API routes
 * SEQUENTIALLY with 3s delays to avoid Groq per-minute token limits.
 */

const BASE_URL = 'https://v0-market-radar-landing-page.vercel.app'

const ROUTES = [
  '/api/analyze',
  '/api/find-competitors',
  '/api/generate-leads',
  '/api/generate-tenders',
  '/api/generate-trends',
  '/api/generate-news',
  '/api/generate-conferences',
]

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function getToken() {
  const res = await fetch(`${BASE_URL}/api/get-test-token`)
  const data = await res.json()
  if (!data.token) throw new Error(`Auth failed: ${data.error}`)
  return data.token
}

async function testRoute(route, token) {
  try {
    const res = await fetch(`${BASE_URL}${route}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    })
    const text = await res.text()
    let data = {}
    try { data = JSON.parse(text) } catch { data = { raw: text.slice(0, 300) } }
    return { route, status: res.status, ok: res.ok, count: data.count ?? null, steps: data.steps ?? null, error: data.error ?? null }
  } catch (e) {
    return { route, status: 0, ok: false, count: null, steps: null, error: e.message }
  }
}

async function main() {
  console.log('\n🔑 Getting auth token...')
  const token = await getToken()
  console.log(`   Token: ${token.slice(0, 20)}...`)

  console.log('\n🧪 Testing routes (sequential, 30s delay between each):\n')

  const results = []
  for (let i = 0; i < ROUTES.length; i++) {
    const route = ROUTES[i]
    process.stdout.write(`  [${i + 1}/${ROUTES.length}] ${route} ... `)
    const result = await testRoute(route, token)
    results.push(result)

    if (result.ok) {
      console.log(`✅ ${result.status} (count: ${result.count ?? 'n/a'})`)
    } else {
      console.log(`❌ ${result.status} | ${result.error}`)
      if (result.steps) {
        console.log(`         steps: ${JSON.stringify(result.steps)}`)
      }
    }

    if (i < ROUTES.length - 1) await sleep(30000)
  }

  console.log('\n--- Final Results ---')
  let failures = 0
  for (const r of results) {
    if (r.ok) {
      console.log(`  ✅ ${r.route} → ${r.status} (count: ${r.count ?? 'n/a'})`)
    } else {
      failures++
      console.log(`  ❌ ${r.route} → ${r.status} | ${r.error}`)
    }
  }

  console.log()
  if (failures === 0) {
    console.log('🎉 ALL ROUTES PASSING')
  } else {
    console.log(`⚠️  ${failures} route(s) failing`)
    process.exit(1)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
