import { tavily } from '@tavily/core'
import { trackSearchUsage } from './usage'

export interface SearchResult {
  title: string
  url: string
  content: string
  score?: number
}

function getTavily() {
  return tavily({ apiKey: process.env.TAVILY_API_KEY! })
}

async function searchWithSerper(query: string): Promise<SearchResult[]> {
  if (!process.env.SERPER_API_KEY) return []
  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': process.env.SERPER_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, gl: 'il', hl: 'he', num: 10 }),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.organic || []).map((r: any) => ({
      title: r.title || '',
      url: r.link || '',
      content: (r.snippet || '').slice(0, 80),
      score: r.position ? 1 / r.position : 0.5,
    }))
  } catch {
    return []
  }
}

export async function search(query: string, maxResults = 10): Promise<SearchResult[]> {
  // Try Tavily first
  try {
    if (!process.env.TAVILY_API_KEY) throw new Error('No Tavily key')
    const result = await getTavily().search(query, { maxResults, includeAnswer: false })
    if (result.results?.length > 0) {
      trackSearchUsage('tavily').catch(() => {})
      return result.results.map(r => ({
        title: r.title,
        url: r.url,
        content: r.content?.slice(0, 80) || '',
        score: r.score,
      }))
    }
    throw new Error('No results from Tavily')
  } catch (e: any) {
    // Fallback to Serper
    console.log('Tavily exhausted/failed → Serper fallback:', e.message?.slice(0, 80))
    const results = await searchWithSerper(query)
    if (results.length > 0) {
      trackSearchUsage('serper').catch(() => {})
    }
    return results
  }
}

export async function multiSearch(queries: string[], maxTotal = 8): Promise<SearchResult[]> {
  const results = await Promise.all(queries.map(q => search(q)))
  const flat = results.flat()
  const seen = new Set<string>()
  return flat.filter(r => {
    if (!r.url || seen.has(r.url)) return false
    seen.add(r.url)
    return true
  }).slice(0, maxTotal)
}
