import { getFullContext } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { extractDomain } from '@/lib/dedup'
import { NextResponse } from 'next/server'

export const maxDuration = 60

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
    let keywords: string
    let saveToDb = false
    let supabase: any = null
    let userId: string | null = null

    if (ctx) {
      businessOverview = ctx.company?.business_overview || ctx.company?.description || ''
      website = ctx.company?.website || ''
      companyName = ctx.company?.name || ''
      keywords = (ctx.company?.keywords || []).join(', ')
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
      keywords = ''
      steps.context = { ok: true, onboarding: true }
    }

    const geoContext = ctx?.geoContext || 'העסק פעיל בכל רחבי ישראל.'

    const prompt = `אתה מומחה לשוק הישראלי עם גישה לאינטרנט.

פרטי העסק:
- סקירה: ${businessOverview}
- אתר: ${website}
- מילות מפתח: ${keywords}
- היקף גיאוגרפי: ${geoContext}

שלב 1 — זהה את הנישה הספציפית ביותר של העסק (לדוגמה: לא "תוספי תזונה" אלא "ייצור תוספי תזונה נוזליים במותג פרטי").

שלב 2 — חפש באינטרנט מתחרים ישירים לנישה הספציפית הזו. ${geoContext.includes('בינלאומי') ? 'כלול מתחרים גם מחוץ לישראל.' : 'תן עדיפות למתחרים בישראל.'}
- חברות שעושות בדיוק את אותו סוג עסק (לא רק תחום כללי)
- חברות עם אותו מודל עסקי (B2B, B2C, יצרן, קמעונאי וכו')
- חברות באותו אזור גיאוגרפי אם רלוונטי

תן לי 8 מתחרים ישירים ועקיפים.
כלול רק חברות שאתה בטוח שקיימות ושיש להן אתר אינטרנט אמיתי.
חשוב: אל תכלול חברה אם אינך יודע את כתובת האתר שלה. עדיף 4 חברות אמיתיות עם אתרים מאשר 8 ללא אתרים.
חפש בעברית ובאנגלית. החזר את שמות החברות ותיאור השירותים בעברית.

החזר JSON בלבד:
[{"name": "", "services": "", "website": "https://...", "threat_score": 0-100, "type": "ישיר/עקיף", "niche_match": "למה הם מתחרים ספציפיים"}]

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

    // User blacklist — names deleted by user in previous scans
    if (saveToDb && userId && supabase) {
      const { data: companyRow } = await supabase
        .from('companies').select('competitors_blacklist').eq('id', userId).single()
      const userBlacklist: string[] = companyRow?.competitors_blacklist || []
      if (userBlacklist.length > 0) {
        competitors = competitors.filter((c: any) => {
          const name = (c.name || '').toLowerCase()
          return !userBlacklist.some(b =>
            name === b.toLowerCase() || name.includes(b.toLowerCase()) || b.toLowerCase().includes(name)
          )
        })
        steps.blacklistFiltered = { removed: userBlacklist.length, remaining: competitors.length }
      }
    }

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

    // Cap at 8
    competitors = competitors.slice(0, 8)

    // Map to working shape — base threat_score capped at 70, bonus added after rating fetch
    const mapped = competitors.map((c: any) => ({
      name: c.name,
      website: c.website,
      services: c.services || '',
      pricing: '',
      threat_score: typeof c.threat_score === 'number'
        ? (c.threat_score <= 10 ? Math.min(70, c.threat_score * 10) : Math.min(70, c.threat_score))
        : 50,
      score_breakdown: c.niche_match || c.score_breakdown || '',
      reason: c.services || '',
      similarity: typeof c.threat_score === 'number' ? Math.min(70, c.threat_score) : 50,
      google_rating: null as number | null,
      google_review_count: null as number | null,
    }))

    // Fetch all Google ratings in parallel before saving
    steps.ratings = { status: 'starting' }
    await Promise.all(
      mapped.map(async (comp) => {
        try {
          const { rating, reviewCount } = await fetchGoogleRating(comp.name, comp.website)
          comp.google_rating = rating
          comp.google_review_count = reviewCount
        } catch { /* keep null */ }
      })
    )
    steps.ratings = {
      ok: true,
      found: mapped.filter(c => c.google_rating !== null).length,
    }

    // Apply Google rating + review count bonus on top of base score
    for (const comp of mapped) {
      let bonus = 0
      if (comp.google_rating != null) {
        if (comp.google_rating >= 4.5) bonus += 20
        else if (comp.google_rating >= 4.0) bonus += 15
        else if (comp.google_rating >= 3.5) bonus += 10
      }
      if (comp.google_review_count != null) {
        if (comp.google_review_count > 500) bonus += 10
        else if (comp.google_review_count >= 100) bonus += 5
      }
      comp.threat_score = Math.min(100, comp.threat_score + bonus)
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
