export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { fetchSerp } from '@/lib/seo/dataforseo'
import { callOpenAIWebSearch } from '@/lib/geo/openai-engine'

function getAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const }
  const adminDb = getAdminClient()
  const { data: role } = await adminDb
    .from('user_roles').select('is_admin').eq('user_id', user.id).single()
  if (!role?.is_admin) return { error: 'Forbidden', status: 403 as const }
  return { user }
}

// GET /api/admin/verify-keys — STEP 0 verification. Makes one real DataForSEO
// SERP call and one real OpenAI web_search call, reports the outcome.
export async function GET() {
  const auth = await requireAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  // ── DataForSEO: one Hebrew SERP on google.co.il / Israel / he ──────────────
  const dfsStart = Date.now()
  const serp = await fetchSerp('עורך דין תל אביב')
  const dataforseo = {
    ok: serp.ok,
    ms: Date.now() - dfsStart,
    resultCount: serp.items.length,
    topDomains: serp.items.slice(0, 5).map(i => i.domain),
    error: serp.error ?? null,
    accountNotVerified: !!serp.error && /not.?verified|payment|balance|insufficient/i.test(serp.error),
  }

  // ── OpenAI: one tiny web_search call ───────────────────────────────────────
  const oaiStart = Date.now()
  const oai = await callOpenAIWebSearch('In one short sentence, what is the capital of Israel? Use web search to confirm.')
  const openai = {
    ok: oai.ok,
    ms: Date.now() - oaiStart,
    sample: (oai.text || '').slice(0, 120),
    error: oai.error ?? null,
    quotaExceeded: !!oai.error && /429|quota|rate.?limit|insufficient/i.test(oai.error),
    model: process.env.OPENAI_GEO_MODEL || 'gpt-5-mini',
    tool: process.env.OPENAI_WEB_SEARCH_TOOL || 'web_search',
  }

  return NextResponse.json({
    ok: dataforseo.ok && openai.ok,
    dataforseo,
    openai,
    envPresent: {
      DATAFORSEO_LOGIN: !!process.env.DATAFORSEO_LOGIN,
      DATAFORSEO_PASSWORD: !!process.env.DATAFORSEO_PASSWORD,
      OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
      GOOGLE_PLACES_API_KEY: !!process.env.GOOGLE_PLACES_API_KEY,
      XAI_API_KEY: !!process.env.XAI_API_KEY,
      GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
    },
  })
}
