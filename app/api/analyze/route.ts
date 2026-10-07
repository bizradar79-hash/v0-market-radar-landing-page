export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const maxDuration = 60

// GET /api/analyze — diagnostic checks, no auth needed to see env/connection status
export async function GET() {
  const checks: Record<string, any> = {}

  // 1. Env vars
  checks.env = {
    GROQ_API_KEY: process.env.GROQ_API_KEY
      ? `set (${process.env.GROQ_API_KEY.slice(0, 8)}...)`
      : 'MISSING',
    TAVILY_API_KEY: process.env.TAVILY_API_KEY
      ? `set (${process.env.TAVILY_API_KEY.slice(0, 8)}...)`
      : 'MISSING',
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL
      ? `set (${process.env.NEXT_PUBLIC_SUPABASE_URL.slice(0, 30)}...)`
      : 'MISSING',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ? `set (${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.slice(0, 20)}...)`
      : 'MISSING',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
      ? `set (${process.env.SUPABASE_SERVICE_ROLE_KEY.slice(0, 20)}...)`
      : 'MISSING',
  }

  // 2. Supabase connection
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.from('companies').select('count').limit(1)
    checks.supabase = error
      ? { ok: false, error: error.message, code: error.code }
      : { ok: true, response: data }
  } catch (e: any) {
    checks.supabase = { ok: false, error: e?.message, stack: e?.stack?.split('\n').slice(0, 3) }
  }

  // 3. Current user
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    checks.auth = error
      ? { ok: false, error: error.message }
      : { ok: true, user: user ? { id: user.id, email: user.email } : null }
  } catch (e: any) {
    checks.auth = { ok: false, error: e?.message }
  }

  // 4. Groq — no longer used (account lost access to its llama models).
  checks.groq = { ok: true, note: 'not used — AI runs on Gemini → xAI' }

  // 5. Tavily reachability (cheap call)
  try {
    if (!process.env.TAVILY_API_KEY || process.env.TAVILY_API_KEY.startsWith('tvly-placeholder')) {
      checks.tavily = { ok: false, error: 'API key is placeholder or missing' }
    } else {
      const { tavily } = await import('@tavily/core')
      const client = tavily({ apiKey: process.env.TAVILY_API_KEY })
      const res = await client.search('test', { maxResults: 1 })
      checks.tavily = { ok: true, resultCount: res.results.length }
    }
  } catch (e: any) {
    checks.tavily = { ok: false, error: e?.message }
  }

  const allOk = checks.supabase?.ok && checks.groq?.ok && checks.tavily?.ok
  return NextResponse.json({ allOk, checks }, { status: allOk ? 200 : 500 })
}

