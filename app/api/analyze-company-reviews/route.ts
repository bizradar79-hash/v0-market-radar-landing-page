export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'

const CACHE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

// At least `threshold` fraction of companyName words appear in candidate
function fuzzyNameMatch(candidate: string, companyName: string, threshold = 0.6): boolean {
  const cand = candidate.toLowerCase()
  const words = companyName.toLowerCase().split(/\s+/).filter(w => w.length >= 2)
  if (words.length === 0) return false
  const matched = words.filter(w => cand.includes(w)).length
  return matched / words.length >= threshold
}

export async function POST(request: Request) {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const force = new URL(request.url).searchParams.get('force') === 'true'
    if (!force) {
      const { data: company } = await ctx.supabase
        .from('companies').select('review_analysis').eq('id', ctx.user.id).single()
      const cached = company?.review_analysis as { fetchedAt?: string } | null
      if (cached?.fetchedAt) {
        const age = Date.now() - new Date(cached.fetchedAt).getTime()
        if (age < CACHE_MS) return NextResponse.json({ success: true, ...cached, cached: true })
      }
    }

    const companyName = ctx.company?.name || ''
    const website = ctx.company?.website || ''
    const city = ctx.company?.city || ''
    const industry = ctx.company?.industry || ''
    const domain = website ? (() => { try { return new URL(website.startsWith('http') ? website : `https://${website}`).hostname.replace(/^www\./, '') } catch { return '' } })() : ''

    if (!companyName) return NextResponse.json({ error: 'Missing company name' }, { status: 400 })

    const cityHint = city ? ` בעיר ${city}` : ''
    // Quote the domain for exact match — prevents matching similarly-named businesses
    const searchQuery = domain
      ? `"${domain}" ביקורות`
      : `"${companyName}" ביקורות${cityHint}`

    const prompt = `אתה מומחה ניתוח שוק ישראלי. השתמש ב-web_search עם השאילתה: ${searchQuery}

CRITICAL: חפש רק ביקורות שמתייחסות לדומיין "${domain || companyName}" ספציפית. אל תחזיר נתונים על שום עסק אחר — גם אם שמו דומה. כל תוצאה שה-URL שלה אינו מכיל "${domain}" ואינה מציינת את הדומיין הזה — דלג עליה לחלוטין.

חפש ביקורות מ: Google Maps, Facebook, Zap, ספריית עסקים ישראלית, iZi, Yad2 עסקים, פורומים ואתרי ביקורות.
לכל מקור שמצאת — ציין את הדירוג ומספר הביקורות בנפרד, וכלול את כתובת ה-URL.

לאחר מכן נתח את הביקורות מנקודת המבט של "${companyName}" שפועל בתחום "${industry}".

החזר JSON בלבד:
{
  "sources": [
    { "name": "Google Maps", "rating": 4.5, "review_count": 120, "url": "https://..." },
    { "name": "Facebook", "rating": 4.2, "review_count": 89, "url": "https://..." }
  ],
  "weighted_average": 4.3,
  "sentiment_score": 8.5,
  "overallSentiment": "חיובי",
  "totalReviewsFound": 209,
  "positiveThemes": ["נושא חיובי 1", "נושא חיובי 2"],
  "negativeThemes": ["נושא שלילי 1"],
  "recurringComplaints": ["תלונה חוזרת 1"],
  "opportunities": ["הזדמנות 1 עבור ${companyName}"],
  "summary": "סיכום קצר של 2-3 משפטים"
}

sources: רשימת מקורות עם דירוג וכמות ביקורות לכל מקור
weighted_average: ממוצע משוקלל לפי כמות ביקורות (1-5)
sentiment_score: ציון סנטימנט כולל (1-10) שמשקף עומק, עקביות ואיכות הביקורות
overallSentiment: חיובי | מעורב | שלילי
CRITICAL: Output ONLY a raw JSON object. No markdown. Start with { and end with }`

    const response = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.XAI_API_KEY}` },
      body: JSON.stringify({
        model: 'grok-4-fast-non-reasoning',
        tools: [{ type: 'web_search' }],
        input: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await response.json()
    if (!response.ok || !data.output) {
      return NextResponse.json({ error: 'xAI API error', detail: data }, { status: 500 })
    }

    const text = data.output
      .filter((item: any) => item.type === 'message')
      .flatMap((item: any) => item.content)
      .filter((c: any) => c.type === 'output_text')
      .map((c: any) => c.text)
      .join('')

    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    const start = clean.indexOf('{')
    const end = clean.lastIndexOf('}')
    if (start === -1 || end <= start) {
      return NextResponse.json({ error: 'Failed to parse response', raw: text.slice(0, 500) }, { status: 500 })
    }

    let parsed: any = {}
    try { parsed = JSON.parse(clean.slice(start, end + 1)) } catch {
      return NextResponse.json({ error: 'JSON parse error', raw: text.slice(0, 500) }, { status: 500 })
    }

    // Strict business matching: domain match is authoritative; fallback to name matching
    function isValidMatch(result: any): boolean {
      // If we have a domain and the result URL contains it — always accept
      if (domain && result.url && (result.url as string).toLowerCase().includes(domain)) return true
      // If we have a domain and the result URL exists but doesn't contain it — reject
      // (prevents a similarly-named business from slipping through via name match)
      if (domain && result.url) return false
      // No domain or no URL — fall back to name-word matching
      const companyWords = companyName.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2)
      if (companyWords.length === 0) return true
      const resultText = [result.name || '', result.url || '', result.snippet || ''].join(' ').toLowerCase()
      const matchCount = companyWords.filter((w: string) => resultText.includes(w)).length
      return matchCount / companyWords.length >= 0.5
    }

    // Normalize and validate sources — reject sources whose name doesn't match company or known platform
    const KNOWN_PLATFORMS = ['google', 'facebook', 'zap', 'izi', 'yad2', 'moovit', 'tripadvisor', 'yelp', 'walla', 'אתר', 'מדריך']
    const rawSources = Array.isArray(parsed.sources) ? parsed.sources : []
    const sources = rawSources
      .map((s: any) => typeof s === 'string'
        ? { name: s, rating: null, review_count: null, url: null }
        : { name: s.name || '', rating: s.rating ?? null, review_count: s.review_count ?? null, url: s.url ?? null }
      )
      .filter((s: any) => {
        if (!s.name) return false
        const nameLower = s.name.toLowerCase()
        // Accept known review platforms or sources whose name matches the company
        const isKnownPlatform = KNOWN_PLATFORMS.some(p => nameLower.includes(p))
        const matchesCompany = fuzzyNameMatch(s.name, companyName, 0.4)
        // Accept if URL contains company domain
        const urlMatchesDomain = domain && s.url && (s.url as string).toLowerCase().includes(domain)
        // Strict match: result text must reference the company
        const strictMatch = isValidMatch(s)
        return strictMatch && (isKnownPlatform || matchesCompany || urlMatchesDomain)
      })

    // Extra pass: only keep sources that reference the company domain or company name
    const firstWord = companyName.toLowerCase().split(/\s+/)[0]
    const validSources = sources.filter((s: any) =>
      (domain && s.url?.toLowerCase().includes(domain)) ||
      (firstWord.length >= 3 && s.name?.toLowerCase().includes(firstWord))
    )
    // When domain is known: empty is better than wrong — never fall back to unvalidated sources
    const finalSources = domain ? validSources : (validSources.length > 0 ? validSources : sources)

    const totalFromSources = finalSources.reduce((sum: number, s: any) => sum + (s.review_count || 0), 0)

    const result = {
      sources: finalSources,
      weighted_average: parsed.weighted_average ?? null,
      sentiment_score: parsed.sentiment_score ?? null,
      overallSentiment: parsed.overallSentiment || 'מעורב',
      totalReviewsFound: parsed.totalReviewsFound ?? totalFromSources,
      positiveThemes: Array.isArray(parsed.positiveThemes) ? parsed.positiveThemes : [],
      negativeThemes: Array.isArray(parsed.negativeThemes) ? parsed.negativeThemes : [],
      recurringComplaints: Array.isArray(parsed.recurringComplaints) ? parsed.recurringComplaints : [],
      opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities : [],
      summary: parsed.summary || '',
      fetchedAt: new Date().toISOString(),
    }

    await ctx.supabase.from('companies').update({ review_analysis: result }).eq('id', ctx.user.id)

    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
