import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export const maxDuration = 60

const TEST_EMAIL = 'test@marketradar.co.il'
const TEST_PASSWORD = 'Test123456!'
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

// Create a Supabase client with no-op cookies (for server-to-server calls)
function makeClient(url: string, key: string) {
  return createServerClient(url, key, {
    cookies: { getAll: () => [], setAll: () => {} },
  })
}

export async function GET() {
  const log: string[] = []

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
    return NextResponse.json({ error: 'Missing env vars', log }, { status: 500 })
  }

  // ── Step 1: Ensure test user exists ────────────────────────────────────────
  const admin = makeClient(SUPABASE_URL, SERVICE_KEY)

  let userId: string
  try {
    const { data, error } = await admin.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    })
    if (error) {
      if (!error.message.toLowerCase().includes('already')) {
        return NextResponse.json({ error: `createUser: ${error.message}`, log }, { status: 500 })
      }
      const { data: list } = await admin.auth.admin.listUsers()
      const existing = list?.users?.find((u) => u.email === TEST_EMAIL)
      if (!existing) return NextResponse.json({ error: 'Cannot find test user', log }, { status: 500 })
      userId = existing.id
      log.push(`User exists: ${userId}`)
    } else {
      userId = data.user!.id
      log.push(`Created user: ${userId}`)
    }
  } catch (e: any) {
    return NextResponse.json({ error: `createUser threw: ${e.message}`, log }, { status: 500 })
  }

  // ── Step 2: Ensure company profile exists ──────────────────────────────────
  const { data: existingCompany } = await admin.from('companies').select('id').eq('id', userId).single()
  if (!existingCompany) {
    const { error: ce } = await admin.from('companies').insert({
      id: userId,
      name: 'חברת טסט AI',
      industry: 'טכנולוגיה',
      description: 'חברת טכנולוגיה ישראלית לצרכי בדיקות אוטומטיות',
      website: 'https://example.com',
      keywords: ['טכנולוגיה', 'תוכנה', 'בינה מלאכותית'],
    })
    if (ce) log.push(`Company warning: ${ce.message}`)
    else log.push('Created test company')
  } else {
    log.push('Company exists')
  }

  // ── Step 3: Sign in to get access token ────────────────────────────────────
  const anonClient = makeClient(SUPABASE_URL, ANON_KEY)
  const { data: { session }, error: signInError } = await anonClient.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  })
  if (!session) {
    return NextResponse.json({ error: `signIn failed: ${signInError?.message}`, log }, { status: 500 })
  }
  log.push(`Signed in: ${session.user.email}`)

  // ── Step 4: Build session cookie (@supabase/ssr v0.9: base64url encoded) ───
  // Storage key = 'supabase.auth.token' (default from @supabase/auth-js)
  // Encoding = 'base64-' + base64url(JSON.stringify(session)) per createServerClient default
  const sessionJson = JSON.stringify(session)
  const base64Value = 'base64-' + Buffer.from(sessionJson).toString('base64url')
  const MAX = 3180
  let cookieHeader: string
  if (encodeURIComponent(base64Value).length <= MAX) {
    cookieHeader = `supabase.auth.token=${base64Value}`
  } else {
    // Chunk the session across multiple cookies
    const parts: string[] = []
    let remaining = base64Value
    let i = 0
    while (remaining.length > 0) {
      let chunk = remaining
      while (encodeURIComponent(chunk).length > MAX) {
        chunk = chunk.slice(0, Math.floor(chunk.length * 0.95))
      }
      parts.push(`supabase.auth.token.${i}=${chunk}`)
      remaining = remaining.slice(chunk.length)
      i++
    }
    cookieHeader = parts.join('; ')
    log.push(`Session chunked into ${i} cookies`)
  }

  // ── Step 5: Test all routes ─────────────────────────────────────────────────
  const results = await Promise.all(
    ROUTES.map(async (route) => {
      try {
        const res = await fetch(`${BASE_URL}${route}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
        })
        const text = await res.text()
        let data: any = {}
        try { data = JSON.parse(text) } catch { data = { raw: text.slice(0, 300) } }
        return { route, status: res.status, ok: res.ok, count: data.count ?? null, steps: data.steps ?? null, error: data.error ?? null }
      } catch (e: any) {
        return { route, status: 0, ok: false, count: null, steps: null, error: e.message }
      }
    })
  )

  return NextResponse.json({ allOk: results.every((r) => r.ok), log, results })
}
