import { NextResponse } from 'next/server'

export async function GET() {
  const base = 'https://v0-market-radar-landing-page.vercel.app'
  const routes = [
    '/api/analyze',
    '/api/find-competitors',
    '/api/generate-leads',
    '/api/generate-tenders',
    '/api/generate-trends',
    '/api/generate-news',
    '/api/generate-conferences',
  ]

  const results = await Promise.all(
    routes.map(async (route) => {
      try {
        const res = await fetch(`${base}${route}`, { method: 'GET' })
        const data = await res.json()
        return { route, status: res.status, ok: res.ok, error: data.error || null }
      } catch (e: any) {
        return { route, status: 0, ok: false, error: e.message }
      }
    })
  )

  return NextResponse.json({ results })
}
