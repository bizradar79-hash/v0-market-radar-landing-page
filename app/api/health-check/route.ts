import { NextResponse } from 'next/server'

export async function GET() {
  const base = 'https://v0-market-radar-landing-page.vercel.app'

  // analyze has a GET diagnostic; all others are POST-only
  const checks = [
    { route: '/api/analyze', method: 'GET' },
    { route: '/api/find-competitors', method: 'POST' },
    { route: '/api/generate-leads', method: 'POST' },
    { route: '/api/generate-tenders', method: 'POST' },
    { route: '/api/generate-trends', method: 'POST' },
    { route: '/api/generate-news', method: 'POST' },
    { route: '/api/generate-conferences', method: 'POST' },
  ]

  const results = await Promise.all(
    checks.map(async ({ route, method }) => {
      let status = 0
      try {
        const res = await fetch(`${base}${route}`, { method })
        status = res.status
        const text = await res.text()
        let data: any = {}
        try { data = JSON.parse(text) } catch { data = { raw: text.slice(0, 200) } }
        // 401 = route reached but needs auth — that's OK for health check
        const ok = res.status === 200 || res.status === 401
        return { route, method, status, ok, error: data.error || null, steps: data.steps || null }
      } catch (e: any) {
        return { route, method, status, ok: false, error: e.message, steps: null }
      }
    })
  )

  const allOk = results.every(r => r.ok)
  return NextResponse.json({ allOk, results })
}
