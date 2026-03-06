import { tavily } from '@tavily/core'

export async function GET() {
  try {
    const client = tavily({ apiKey: process.env.TAVILY_API_KEY! })
    const res = await client.search('תוספי תזונה ישראל', { maxResults: 3 })
    return Response.json({ 
      ok: true, 
      results: res.results.map(r => ({ title: r.title, url: r.url })) 
    })
  } catch(e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ ok: false, error: message })
  }
}
