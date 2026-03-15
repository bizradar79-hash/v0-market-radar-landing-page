import { getFullContext } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { extractDomain } from '@/lib/dedup'
import { NextResponse } from 'next/server'

export const maxDuration = 300

async function fetchGoogleRating(name: string, website: string): Promise<{ rating: number | null; reviewCount: number | null }> {
  try {
    const prompt = `חפש את הפרטים הבאים על העסק: ${name}${website ? ` (אתר: ${website})` : ''}
מצא: כתובת מדויקת, טלפון, דירוג גוגל, מספר ביקורות, 3 ביקורות טובות ו-3 ביקורות פחות טובות
לכל ביקורת כלול: שם הכותב, ציון (1-5), טקסט הביקורת
החזר JSON בלבד:
{"address": "", "phone": "", "rating": 0, "review_count": 0, "top_reviews": [{"author": "", "rating": 0, "text": ""}], "bottom_reviews": [{"author": "", "rating": 0, "text": ""}]}`

    const res = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'grok-4-fast-non-reasoning',
        input: [{ role: 'user', content: prompt }],
        tools: [{ type: 'web_search' }],
      }),
    })
    if (!res.ok) return { rating: null, reviewCount: null }

    const data = await res.json()
    if (!data.output) return { rating: null, reviewCount: null }

    const text = data.output
      .filter((item: any) => item.type === 'message')
      .flatMap((item: any) => item.content)
      .filter((c: any) => c.type === 'output_text')
      .map((c: any) => c.text)
      .join('')

    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    const start = clean.indexOf('{')
    const end = clean.lastIndexOf('}')
    if (start === -1 || end <= start) return { rating: null, reviewCount: null }

    let parsed: any = {}
    try { parsed = JSON.parse(clean.slice(start, end + 1)) } catch { return { rating: null, reviewCount: null } }

    const rating = typeof parsed.rating === 'number' && parsed.rating > 0 ? parsed.rating : null
    const reviewCount = typeof parsed.review_count === 'number' ? parsed.review_count : null
    return { rating, reviewCount }
  } catch {
    return { rating: null, reviewCount: null }
  }
}

async function callXAI(prompt: string): Promise<any[]> {
  const response = await fetch('https://api.x.ai/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'grok-4-fast-non-reasoning',
      input: [{ role: 'user', content: prompt }],
      tools: [{ type: 'web_search' }],
    }),
  })
  const data = await response.json()
  if (!response.ok || !data.output) return []
  const text = data.output
    .filter((item: any) => item.type === 'message')
    .flatMap((item: any) => item.content)
    .filter((c: any) => c.type === 'output_text')
    .map((c: any) => c.text)
    .join('')
  const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
  const start = clean.indexOf('[')
  const end = clean.lastIndexOf(']')
  if (start === -1 || end <= start) return []
  try {
    const list = JSON.parse(clean.slice(start, end + 1))
    return Array.isArray(list) ? list : []
  } catch { return [] }
}

export async function POST(request: Request) {
  const steps: Record<string, any> = {}
  try {
    let body: any = {}
    try { body = await request.json() } catch {}

    const ctx = await getFullContext()

    let businessOverview: string
    let website: string
    let companyName: string
    let saveToDb = false
    let supabase: any = null
    let userId: string | null = null

    if (ctx) {
      businessOverview = ctx.company?.business_overview || ctx.company?.description || ''
      website = ctx.company?.website || ''
      companyName = ctx.company?.name || ''
      saveToDb = true
      supabase = ctx.supabase
      userId = ctx.user.id
      steps.context = { ok: true, company: ctx.company?.name }
    } else {
      const serverClient = await createClient()
      const { data: { user } } = await serverClient.auth.getUser()
      if (!user) return NextResponse.json({ error: 'Unauthorized', steps }, { status: 401 })

      businessOverview = [body.industry, body.description].filter(Boolean).join(' — ')
      website = body.website || ''
      companyName = ''
      steps.context = { ok: true, onboarding: true }
    }

    const prompt = `בהתבסס על הסקירה הבאה של עסק ישראלי: ${businessOverview}
ואתר העסק: ${website}

תן לי רשימה של 10 מתחרים ישירים ועקיפים בישראל הרלוונטיים לסוג העסק הזה.
כלול רק חברות שאתה בטוח שקיימות ושיש להן אתר אינטרנט אמיתי.

חשוב: אל תכלול חברה אם אינך יודע את כתובת האתר שלה. עדיף 5 חברות אמיתיות עם אתרים מאשר 10 חברות ללא אתרים.

לכל מתחרה תן threat_score 0-100 לפי שלושה קריטריונים:
- גודל החברה וחלקה בשוק: 0-40 נקודות
- חפיפה בשירותים/מוצרים: 0-40 נקודות
- אזור גיאוגרפי משותף בישראל: 0-20 נקודות
הסבר את הציון בשדה score_breakdown (משפט קצר בעברית).

חפש מתחרים בעברית ובאנגלית. החזר את שמות החברות ותיאור השירותים בעברית.

החזר JSON בלבד במבנה הזה:
[{"name": "", "services": "", "website": "https://...", "threat_score": 0-100, "score_breakdown": "", "type": "ישיר/עקיף"}]

CRITICAL: Output ONLY a raw JSON array. No markdown, no explanation. Start with [ and end with ]`

    steps.ai = { status: 'starting' }
    let competitors = await callXAI(prompt)

    steps.ai = {
      ok: true,
      raw: competitors.length,
      names: competitors.map((c: any) => `${c.name} → ${c.website || 'NO URL'}`),
    }

    // Keep only entries where xAI provided a real URL
    competitors = competitors.filter((c: any) =>
      typeof c.website === 'string' && c.website.startsWith('http')
    )
    steps.ai.withUrl = competitors.length

    // Filter out own company
    competitors = competitors.filter((c: any) => {
      const domain = extractDomain(c.website || '')
      return domain !== extractDomain(website) &&
        !c.name?.toLowerCase().includes(companyName.toLowerCase().slice(0, 6))
    })

    // Blocklist
    const RETAIL_BLOCKLIST = [
      'שופרסל', 'רמי לוי', 'יינות ביתן', 'ויקטורי', 'סופר-פארם', 'super-pharm',
      'amazon', 'ebay', 'iherb', 'aliexpress', 'walgreens', 'boots',
    ]
    competitors = competitors.filter((c: any) => {
      const name = (c.name || '').toLowerCase()
      const site = (c.website || '').toLowerCase()
      return !RETAIL_BLOCKLIST.some(b => name.includes(b.toLowerCase()) || site.includes(b.toLowerCase()))
    })

    // Deduplicate by domain
    const seenDomains = new Set<string>()
    competitors = competitors.filter((c: any) => {
      const domain = extractDomain(c.website)
      if (!domain || seenDomains.has(domain)) return false
      seenDomains.add(domain)
      return true
    })

    // Map to working shape
    const mapped = competitors.map((c: any) => ({
      name: c.name,
      website: c.website,
      services: c.services || '',
      pricing: '',
      threat_score: typeof c.threat_score === 'number'
        ? (c.threat_score <= 10 ? c.threat_score * 10 : Math.min(100, c.threat_score))
        : 70,
      score_breakdown: c.score_breakdown || '',
      reason: c.services || '',
      similarity: typeof c.threat_score === 'number' ? Math.min(100, c.threat_score) : 70,
      google_rating: null as number | null,
      google_review_count: null as number | null,
    }))

    // Fetch Google ratings sequentially before saving
    steps.ratings = { status: 'starting' }
    for (const comp of mapped) {
      const { rating, reviewCount } = await fetchGoogleRating(comp.name, comp.website)
      comp.google_rating = rating
      comp.google_review_count = reviewCount
      await new Promise(r => setTimeout(r, 300))
    }
    steps.ratings = {
      ok: true,
      found: mapped.filter(c => c.google_rating !== null).length,
    }

    // Skip DB save during onboarding
    if (!saveToDb || !supabase || !userId) {
      return NextResponse.json({ success: true, competitors: mapped, count: mapped.length, steps })
    }

    steps.db = 'starting'

    const { data: manualComps } = await supabase
      .from('competitors')
      .select('website')
      .eq('company_id', userId)
      .eq('source', 'manual')
    const manualDomains = new Set(
      (manualComps || []).map((c: any) => extractDomain(c.website || '')).filter(Boolean)
    )
    steps.db = { manualKept: manualDomains.size }

    const { error: deleteError } = await supabase.from('competitors').delete()
      .eq('company_id', userId)
      .or('source.eq.auto,source.is.null')
    if (deleteError) {
      await supabase.from('competitors').delete().eq('company_id', userId)
    }

    const deduped = mapped.filter((c: any) => {
      const domain = extractDomain(c.website || '')
      return !domain || !manualDomains.has(domain)
    })

    if (deduped.length === 0) {
      return NextResponse.json({ success: true, competitors: [], count: 0, steps })
    }

    const insertRows = deduped.map((c: any) => ({
      name: c.name,
      website: c.website,
      services: c.services,
      pricing: '',
      threat_score: c.threat_score,
      last_activity: c.score_breakdown || '',
      google_rating: c.google_rating,
      google_review_count: c.google_review_count,
      company_id: userId,
      source: 'auto',
    }))

    let { data: saved, error: insertError } = await supabase
      .from('competitors').insert(insertRows).select()

    // Graceful fallback if columns missing (migration not run)
    if (insertError?.code === '42703') {
      const rowsFallback = insertRows.map(({ google_rating: _r, google_review_count: _rc, source: _s, ...rest }: any) => rest)
      ;({ data: saved, error: insertError } = await supabase
        .from('competitors').insert(rowsFallback).select())
    }

    if (insertError) {
      steps.db = { ok: false, error: insertError.message, code: insertError.code }
      return NextResponse.json({ error: 'DB insert failed', steps }, { status: 500 })
    }
    steps.db = { ok: true, saved: saved?.length }

    return NextResponse.json({ success: true, competitors: saved, count: saved?.length || 0, steps })
  } catch (e: any) {
    console.error('find-competitors error:', e?.message)
    return NextResponse.json({ error: e?.message, stack: e?.stack?.split('\n').slice(0, 4), steps }, { status: 500 })
  }
}
