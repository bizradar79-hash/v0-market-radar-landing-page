import * as crypto from 'crypto'
import type { TenderPoolItem, TenderSource } from './types'
import { findAdapter } from './adapters'

function extractXaiText(data: any): string {
  return data.output
    ?.filter((b: any) => b.type === 'message')
    .flatMap((b: any) => b.content)
    .filter((c: any) => c.type === 'output_text')
    .map((c: any) => c.text)
    .join('') || ''
}

function urlHash(url: string): string {
  return crypto.createHash('sha1').update(url).digest('hex').slice(0, 16)
}

// ── Adapter path: direct API call, returns fully enriched tenders ─────────

async function fetchViaAdapter(listingUrl: string): Promise<TenderPoolItem[]> {
  const adapter = findAdapter(listingUrl)
  if (!adapter) return []

  console.log(`[public-urls] Using adapter: ${adapter.siteName}`)
  const normalized = await adapter.fetchTenders()

  return normalized.map(t => ({
    external_id: t.external_id,
    title: t.title,
    publisher: t.publisher,
    description: t.description,
    url: t.url,
    deadline: t.deadline || undefined,
    publish_date: t.publish_date || undefined,
    category: t.category || 'מכרזים ציבוריים',
    raw_data: {
      source: 'adapter',
      adapter: adapter.siteName,
      tender_number: t.tender_number,
      ...(t.raw ? { _raw: t.raw } : {}),
    },
  }))
}

// ── AI fallback: xAI web_search discovery (for sites without adapter) ─────

async function discoverViaXai(listingUrl: string): Promise<TenderPoolItem[]> {
  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) throw new Error('XAI_API_KEY not set')

  const today = new Date().toISOString().split('T')[0]

  console.log(`[public-urls] AI fallback for: ${listingUrl}`)
  const res = await fetch('https://api.x.ai/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'grok-4-fast-non-reasoning',
      tools: [{ type: 'web_search' }],
      input: [
        { role: 'system', content: 'You find individual tender URLs on listing pages. Output JSON only, no markdown.' },
        {
          role: 'user', content: `Visit this tender listing page: ${listingUrl}

Find ALL individual tender entries currently on the page (not archived/expired).
For each tender, return:
- url: the direct URL to the tender's detail page or PDF (MUST be a real URL from the site — do NOT invent)
- preview_title: the tender title as shown on listing

Skip:
- Navigation links, 'back to home', pagination links
- RFI (בקשה למידע) — these are info requests, not tenders
- Exemption notices (פטור, כוונה להתקשרות)
- Expired tenders (if deadline visible and < ${today})

If the listing page requires filters/search to show tenders, use reasonable defaults (no filter, most recent).

Output JSON only:
{"site_name": "name of the publishing organization", "tenders": [{"url": "https://...", "preview_title": "..."}]}

If no tenders found, return {"site_name": "...", "tenders": []}.
Return MAX 30 tenders per page.`,
        },
      ],
    }),
    signal: AbortSignal.timeout(60000),
  })

  if (!res.ok) throw new Error(`xAI HTTP ${res.status}`)

  const data = await res.json()
  const text = extractXaiText(data)

  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  let parsed: any
  try {
    parsed = JSON.parse(clean)
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in xAI response')
    parsed = JSON.parse(jsonMatch[0])
  }

  const siteName = parsed.site_name || new URL(listingUrl).hostname
  const discovered: any[] = Array.isArray(parsed.tenders) ? parsed.tenders : []

  return discovered
    .filter(t => t.url)
    .map(t => ({
      external_id: urlHash(t.url),
      title: t.preview_title || 'מכרז ללא כותרת',
      url: t.url,
      publisher: siteName,
      category: 'מכרזים ציבוריים',
      raw_data: { source: 'ai_fallback', listing_url: listingUrl, site_name: siteName },
    }))
}

// ── Main entry point ──────────────────────────────────────────────────────

export async function scrapePublicTenderUrls(source: TenderSource): Promise<TenderPoolItem[]> {
  const urls: string[] = source.config?.urls || []
  if (urls.length === 0) {
    console.log('[public-urls] No URLs configured for source:', source.name)
    return []
  }

  console.log(`[public-urls] === Scanning ${urls.length} listing URLs ===`)
  const tenders: TenderPoolItem[] = []
  const seenIds = new Set<string>()

  for (const listingUrl of urls) {
    try {
      const adapter = findAdapter(listingUrl)
      let items: TenderPoolItem[]

      if (adapter) {
        items = await fetchViaAdapter(listingUrl)
        console.log(`[public-urls] Adapter "${adapter.siteName}": ${items.length} tenders (fully enriched)`)
      } else {
        items = await discoverViaXai(listingUrl)
        console.log(`[public-urls] AI fallback: ${items.length} tenders (need enrichment)`)
      }

      for (const item of items) {
        if (seenIds.has(item.external_id)) continue
        seenIds.add(item.external_id)
        tenders.push(item)
      }

      // Polite delay between listing pages
      if (urls.indexOf(listingUrl) < urls.length - 1) {
        await new Promise(r => setTimeout(r, 500))
      }
    } catch (err: any) {
      console.warn(`[public-urls] Error scanning ${listingUrl}:`, err?.message)
    }
  }

  console.log(`[public-urls] === Done: ${tenders.length} unique tenders from ${urls.length} URLs ===`)
  return tenders
}
