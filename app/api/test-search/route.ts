import { search } from '@/lib/search'

export async function GET() {
  try {
    const results = await search('תוספי תזונה ישראל', 3)
    return Response.json({
      ok: true,
      provider: results.length > 0 ? 'ok' : 'no results',
      results: results.map(r => ({ title: r.title, url: r.url }))
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ ok: false, error: message })
  }
}
