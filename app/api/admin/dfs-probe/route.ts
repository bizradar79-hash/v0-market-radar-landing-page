export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'

// Admin-only diagnostic: run ONE DataForSEO SERP live query and return the raw
// items, to inspect real response shapes before wiring an engine to them.
// DataForSEO only accepts our production IPs, so this can't be probed locally.
// Auth: x-admin-secret must equal the service-role key (same as the admin
// override in lib/context.ts). POST { endpoint: 'organic'|'news', keyword, depth? }
export async function POST(req: Request) {
  if (req.headers.get('x-admin-secret') !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => ({}))
  const auth0 = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')
  // Generic mode: { path: 'ai_optimization/claude/llm_responses/models', method?, payload? }
  if (typeof body.path === 'string' && /^[a-z0-9_/]+$/.test(body.path)) {
    const r = await fetch(`https://api.dataforseo.com/v3/${body.path}`, {
      method: body.method === 'GET' ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth0 },
      body: body.method === 'GET' ? undefined : JSON.stringify(body.payload ?? []),
    })
    return NextResponse.json(await r.json().catch(() => ({ http: r.status })))
  }
  const endpoint = body.endpoint === 'news' ? 'news' : 'organic'
  const keyword = String(body.keyword || '').slice(0, 200)
  if (!keyword) return NextResponse.json({ error: 'keyword required' }, { status: 400 })
  const auth = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')
  const res = await fetch(`https://api.dataforseo.com/v3/serp/google/${endpoint}/live/advanced`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify([{
      keyword, location_name: body.location_name || 'Israel', language_code: body.language_code || 'he',
      depth: Math.min(Number(body.depth) || 20, 50),
    }]),
  })
  const data = await res.json().catch(() => ({}))
  const t = data?.tasks?.[0]
  return NextResponse.json({
    status: data?.status_code, cost: data?.cost, task: t?.status_code, message: t?.status_message,
    item_types: t?.result?.[0]?.item_types, items: t?.result?.[0]?.items ?? [],
  })
}
