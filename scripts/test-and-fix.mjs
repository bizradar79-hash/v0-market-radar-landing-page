#!/usr/bin/env node
/**
 * test-and-fix.mjs
 * Calls /api/run-tests on Vercel, displays results.
 * All auth happens server-side — no local credentials needed.
 */

const BASE_URL = 'https://v0-market-radar-landing-page.vercel.app'

async function runTests() {
  console.log('\n📡 Calling /api/run-tests ...\n')
  const res = await fetch(`${BASE_URL}/api/run-tests`)
  if (!res.ok && res.status !== 200) {
    const text = await res.text()
    console.error(`❌ /api/run-tests returned ${res.status}: ${text.slice(0, 500)}`)
    return null
  }
  return res.json()
}

async function main() {
  const data = await runTests()
  if (!data) process.exit(1)

  console.log('📋 Setup log:')
  data.log?.forEach((l) => console.log('  •', l))
  console.log()

  console.log('🧪 Route results:')
  let failures = 0
  for (const r of data.results) {
    if (r.ok) {
      console.log(`  ✅ ${r.route} → ${r.status} (count: ${r.count ?? 'n/a'})`)
    } else {
      failures++
      console.log(`  ❌ ${r.route} → ${r.status} | error: ${r.error}`)
      if (r.steps) {
        console.log(`     steps: ${JSON.stringify(r.steps)}`)
      }
    }
  }

  console.log()
  if (data.allOk) {
    console.log('🎉 ALL ROUTES PASSING')
  } else {
    console.log(`⚠️  ${failures} route(s) failing — see steps above for details`)
    process.exit(1)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
