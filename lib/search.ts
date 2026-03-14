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

// DuckDuckGo Instant Answer API — completely free, no key needed
async function searchWithDDG(query: string): Promise<SearchResult[]> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return []
    const data = await res.json()
    const results: SearchResult[] = []
    if (data.AbstractURL && data.AbstractText) {
      results.push({
        title: data.Heading || query,
        url: data.AbstractURL,
        content: data.AbstractText.slice(0, 300),
        score: 1.0,
      })
    }
    for (const topic of (data.RelatedTopics || []).slice(0, 9)) {
      if (topic.FirstURL && topic.Text) {
        results.push({ title: topic.Text.slice(0, 80), url: topic.FirstURL, content: topic.Text.slice(0, 200), score: 0.5 })
      }
      for (const sub of (topic.Topics || []).slice(0, 3)) {
        if (sub.FirstURL && sub.Text) {
          results.push({ title: sub.Text.slice(0, 80), url: sub.FirstURL, content: sub.Text.slice(0, 200), score: 0.4 })
        }
      }
    }
    return results
  } catch { return [] }
}

// Brave Search API — free tier 2000 req/month
async function searchWithBrave(query: string): Promise<SearchResult[]> {
  if (!process.env.BRAVE_API_KEY) return []
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10&country=il&search_lang=he`
    const res = await fetch(url, {
      headers: { 'X-Subscription-Token': process.env.BRAVE_API_KEY, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.web?.results || []).map((r: any, i: number) => ({
      title: r.title || '',
      url: r.url || '',
      content: (r.description || '').slice(0, 300),
      score: 1 / (i + 1),
    }))
  } catch { return [] }
}

async function searchWithSerper(query: string): Promise<SearchResult[]> {
  if (!process.env.SERPER_API_KEY) return []
  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': process.env.SERPER_API_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, gl: 'il', hl: 'he', num: 10 }),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.organic || []).map((r: any) => ({
      title: r.title || '',
      url: r.link || '',
      content: (r.snippet || '').slice(0, 300),
      score: r.position ? 1 / r.position : 0.5,
    }))
  } catch { return [] }
}

export async function search(query: string, maxResults = 10): Promise<SearchResult[]> {
  // 1. Tavily
  try {
    if (!process.env.TAVILY_API_KEY) throw new Error('No Tavily key')
    const result = await getTavily().search(query, { maxResults, includeAnswer: false })
    if (result.results?.length > 0) {
      trackSearchUsage('tavily').catch(() => {})
      return result.results.map(r => ({
        title: r.title,
        url: r.url,
        content: r.content?.slice(0, 300) || '',
        score: r.score,
      }))
    }
    throw new Error('No results from Tavily')
  } catch (e: any) {
    console.log('Tavily exhausted/failed → free search fallback:', e.message?.slice(0, 80))
  }

  // 2. DuckDuckGo (free, no key)
  const ddg = await searchWithDDG(query)
  if (ddg.length > 0) {
    trackSearchUsage('duckduckgo').catch(() => {})
    return ddg.slice(0, maxResults)
  }

  // 3. Brave
  const brave = await searchWithBrave(query)
  if (brave.length > 0) {
    trackSearchUsage('brave').catch(() => {})
    return brave.slice(0, maxResults)
  }

  // 4. Serper (last resort)
  const serper = await searchWithSerper(query)
  if (serper.length > 0) {
    trackSearchUsage('serper').catch(() => {})
  }
  return serper.slice(0, maxResults)
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
