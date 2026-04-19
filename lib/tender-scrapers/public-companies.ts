import type { TenderPoolItem } from './types'

const QUERIES = [
  'מכרזי קופות חולים פעילים ישראל 2026',
  'מכרזי בנקים ישראל 2026',
]

function extractXaiText(data: any): string {
  return data.output
    ?.filter((b: any) => b.type === 'message')
    .flatMap((b: any) => b.content)
    .filter((c: any) => c.type === 'output_text')
    .map((c: any) => c.text)
    .join('') || ''
}

export async function scrapePublicCompanies(): Promise<TenderPoolItem[]> {
  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) {
    console.warn('[public-companies] XAI_API_KEY not set, skipping')
    return []
  }

  const today = new Date().toISOString().split('T')[0]
  const tenders: TenderPoolItem[] = []

  for (const query of QUERIES) {
    try {
      const prompt = `חפש מכרזים פעילים: ${query}

החזר JSON בלבד בפורמט הבא:
{"tenders": [{"title": "שם המכרז", "publisher": "הגוף המפרסם", "deadline": "YYYY-MM-DD", "url": "קישור ישיר לדף המכרז", "category": "קטגוריה", "description": "תיאור קצר", "budget": "תקציב אם ידוע"}]}

חשוב:
- רק מכרזים עם תאריך הגשה עתידי
- URL חייב להיות ישיר לדף המכרז הספציפי - לא PDF, לא דף ראשי
- החזר JSON בלבד ללא markdown`

      const res = await fetch('https://api.x.ai/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'grok-4-fast-non-reasoning',
          tools: [{ type: 'web_search' }],
          input: prompt,
        }),
        signal: AbortSignal.timeout(60000),
      })

      if (!res.ok) {
        console.warn(`[public-companies] xAI error ${res.status} for "${query}"`)
        continue
      }

      const data = await res.json()
      const text = extractXaiText(data)

      let items: any[] = []
      try {
        const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        const parsed = JSON.parse(clean)
        items = Array.isArray(parsed) ? parsed : (parsed.tenders || [])
      } catch {
        const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0])
            items = Array.isArray(parsed) ? parsed : (parsed.tenders || [])
          } catch {}
        }
      }

      // Filter: deadline must be future
      for (const item of items) {
        if (item.deadline && item.deadline < today) continue
        if (!item.title) continue

        const externalId = `pub-${item.title.slice(0, 30).replace(/\s+/g, '-')}-${item.publisher?.slice(0, 20) || 'unknown'}`

        tenders.push({
          external_id: externalId,
          title: item.title,
          publisher: item.publisher,
          deadline: item.deadline,
          url: item.url,
          category: 'חברות ציבוריות',
          description: item.description,
          budget: item.budget,
          raw_data: { query, source: 'xai_web_search' },
        })
      }
    } catch (err: any) {
      console.warn(`[public-companies] Error for "${query}":`, err?.message)
    }
  }

  console.log(`[public-companies] Found ${tenders.length} tenders`)
  return tenders
}
