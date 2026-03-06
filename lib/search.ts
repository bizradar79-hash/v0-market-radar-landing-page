import { tavily } from '@tavily/core'

const client = tavily({ apiKey: process.env.TAVILY_API_KEY! })

export async function search(query: string, maxResults = 8) {
  try {
    const res = await client.search(query, { maxResults, includeAnswer: true })
    return res.results.map(r => ({
      title: r.title,
      url: r.url,
      content: r.content?.slice(0, 400) || '',
      score: r.score
    }))
  } catch { return [] }
}

export async function multiSearch(queries: string[]) {
  const results = await Promise.all(queries.map(q => search(q, 10)))
  const flat = results.flat()
  // Deduplicate by URL
  const seen = new Set()
  return flat.filter(r => {
    if (seen.has(r.url)) return false
    seen.add(r.url)
    return true
  })
}
