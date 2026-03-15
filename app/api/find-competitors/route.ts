import { getFullContext } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { extractDomain } from '@/lib/dedup'
import { NextResponse } from 'next/server'

export const maxDuration = 60

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
      // Normal path — company profile exists
      businessOverview = ctx.company?.business_overview || ctx.company?.description || ''
      website = ctx.company?.website || ''
      companyName = ctx.company?.name || ''
      saveToDb = true
      supabase = ctx.supabase
      userId = ctx.user.id
      steps.context = { ok: true, company: ctx.company?.name }
    } else {
      // Onboarding path — company not yet saved, auth via session/bearer
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

חפש מתחרים בעברית ובאנגלית. החזר את שמות החברות ותיאור השירותים בעברית.

החזר JSON בלבד במבנה הזה:
[{"name": "", "services": "", "website": "https://...", "threat_score": 0-100, "type": "ישיר/עקיף"}]

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

    // Blocklist: known retailers, pharmacy chains, e-commerce
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

    // Map to response shape
    const mapped = competitors.map((c: any) => ({
      name: c.name,
      website: c.website,
      services: c.services || '',
      pricing: '',
      threat_score: typeof c.threat_score === 'number'
        ? (c.threat_score <= 10 ? c.threat_score * 10 : Math.min(100, c.threat_score))
        : 70,
      reason: c.services || '',
      similarity: typeof c.threat_score === 'number' ? Math.min(100, c.threat_score) : 70,
    }))

    // Skip DB save during onboarding (no company profile yet)
    if (!saveToDb || !supabase || !userId) {
      return NextResponse.json({ success: true, competitors: mapped, count: mapped.length, steps })
    }

    steps.db = 'starting'

    // Fetch existing manual competitors so we can preserve and deduplicate them
    const { data: manualComps } = await supabase
      .from('competitors')
      .select('website')
      .eq('company_id', userId)
      .eq('source', 'manual')
    const manualDomains = new Set(
      (manualComps || []).map((c: any) => extractDomain(c.website || '')).filter(Boolean)
    )
    steps.db = { manualKept: manualDomains.size }

    // Delete only auto-discovered competitors — never touch manual ones
    await supabase.from('competitors').delete()
      .eq('company_id', userId)
      .or('source.eq.auto,source.is.null')

    // Remove new auto entries that would duplicate a manual competitor
    const deduped = mapped.filter((c: any) => {
      const domain = extractDomain(c.website || '')
      return !domain || !manualDomains.has(domain)
    })

    if (deduped.length === 0) {
      return NextResponse.json({ success: true, competitors: [], count: 0, steps })
    }

    const { data: saved, error: insertError } = await supabase.from('competitors').insert(
      deduped.map((c: any) => ({
        name: c.name,
        website: c.website,
        services: c.services,
        pricing: '',
        threat_score: c.threat_score,
        company_id: userId,
        source: 'auto',
      }))
    ).select()

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
