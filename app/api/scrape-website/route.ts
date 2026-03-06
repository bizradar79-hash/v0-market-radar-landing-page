export async function POST(req: Request) {
  const { url } = await req.json()
  try {
    const res = await fetch(url, { 
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(8000)
    })
    const html = await res.text()
    // Extract text content - remove HTML tags
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 3000) // First 3000 chars
    return Response.json({ success: true, content: text })
  } catch {
    return Response.json({ success: false, content: '' })
  }
}
