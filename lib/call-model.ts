import type { ScanCostCollector } from '@/lib/scan/cost-tracker'
// ── Two-stage pipeline: Gemini (content) → xAI (URLs) ────────────────────────
// Stage 1: Gemini finds tender details (title, publisher, deadline, description, budget) — NO URLs
// Stage 2: For each tender, xAI searches for the real page URL via web_search
// Returns JSON string: { tenders: [...] }
export async function callModelTwoStage(prompt: string, _company?: any): Promise<string> {
  const GEMINI_MODEL = 'gemini-2.5-flash'

  // ── Stage 1: Gemini ──────────────────────────────────────────────────────
  const geminiPrompt = prompt +
    '\n\nחשוב: אל תכלול URLs או קישורים בתשובה. השאר את שדה ה-url ריק לחלוטין. ' +
    'רק תוכן: כותרת, גוף מפרסם, תאריך הגשה, תיאור, תקציב.'

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: geminiPrompt }] }],
        tools: [{ google_search: {} }],
      }),
    }
  )
  if (!geminiRes.ok) throw new Error(`Gemini (stage 1) error ${geminiRes.status}: ${await geminiRes.text()}`)
  const geminiData = await geminiRes.json()

  const geminiText = geminiData.candidates?.[0]?.content?.parts
    ?.filter((p: any) => p.text)
    .map((p: any) => p.text)
    .join('') || ''

  // Parse tenders from Gemini response
  let tenders: any[] = []
  try {
    const clean = geminiText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(clean)
    tenders = Array.isArray(parsed) ? parsed : (parsed.tenders || [])
  } catch {
    try {
      const match = geminiText.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
      if (match) {
        const parsed = JSON.parse(match[0])
        tenders = Array.isArray(parsed) ? parsed : (parsed.tenders || [])
      }
    } catch {}
  }

  if (tenders.length === 0) {
    console.warn('[callModelTwoStage] Stage 1 returned 0 tenders, returning raw text')
    return geminiText
  }

  console.log(`[callModelTwoStage] Stage 1 ok: ${tenders.length} tenders. Starting Stage 2 URL lookup...`)

  // ── Stage 2: xAI — find real URL for each tender (max 5 in parallel) ───────
  const tendersToLookup = tenders.slice(0, 5)
  const urlResults = await Promise.all(
    tendersToLookup.map((tender: any) =>
      findRealUrl(
        tender.title || '',
        `מכרז של ${tender.publisher || tender.organization || tender.ministry || 'הגוף הממשלתי'}`,
      ),
    )
  )

  console.log('[callModelTwoStage] Stage 2 ok. URLs found:', urlResults.filter(Boolean).length)

  // ── Merge: Gemini content + xAI URLs ─────────────────────────────────────
  const merged = tendersToLookup.map((tender: any, i: number) => ({
    ...tender,
    url: urlResults[i] || tender.url || '',
  }))

  return JSON.stringify({ tenders: merged })
}

// ── Stage-2 URL resolver ─────────────────────────────────────────────────────
// Per-item xAI web_search to find the REAL page URL for an item (tender,
// conference, …). Shared by callModelTwoStage and generate-conferences so both
// resolve URLs identically instead of trusting a model-written `website` field.
// Returns '' when nothing is found. Callers should still validateUrl() the
// result before storing it.
export async function findRealUrl(
  title: string, context: string, cost?: ScanCostCollector,
): Promise<string> {
  const XAI_MODEL = 'grok-4-fast-non-reasoning'
  if (!title.trim()) return ''
  const urlPrompt = `מצא את הקישור הרשמי לדף של: "${title}"${context ? ` (${context})` : ''}.
הקישור חייב להיות לדף HTML אמיתי של הפריט הספציפי — לא PDF, לא דף ראשי גנרי.
החזר JSON בלבד: {"url": "https://..."}`
  try {
    const xaiRes = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: XAI_MODEL,
        tools: [{ type: 'web_search' }],
        input: urlPrompt,
      }),
    })
    if (!xaiRes.ok) return ''
    const xaiData = await xaiRes.json()
    // This is a PAID web_search. It used to be entirely absent from
    // cost_breakdown while firing once per item in leads/conferences loops —
    // the single largest untracked cost in a scan.
    cost?.add({ provider: 'xai', model: XAI_MODEL, webSearch: true, data: xaiData })
    const xaiText = xaiData.output
      ?.filter((b: any) => b.type === 'message')
      .flatMap((b: any) => b.content)
      .filter((c: any) => c.type === 'output_text')
      .map((c: any) => c.text)
      .join('') || ''
    try {
      const clean = xaiText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const parsed = JSON.parse(clean)
      return parsed.url || ''
    } catch {
      const match = xaiText.match(/https?:\/\/[^\s"',\]]+/)
      return match?.[0] || ''
    }
  } catch (e: any) {
    console.warn(`[findRealUrl] failed for "${title}":`, e?.message)
    return ''
  }
}

/**
 * The providers callModel can actually service. Exported so callers can VALIDATE
 * a stored prompt_versions row before calling — an unknown provider throws
 * instantly, which is easily mistaken for "ran fine, found nothing".
 */
export const SUPPORTED_PROVIDERS = ['xai', 'gemini', 'groq'] as const
export function isSupportedProvider(p: unknown): boolean {
  return typeof p === 'string' && (SUPPORTED_PROVIDERS as readonly string[]).includes(p.trim())
}

// ── Single-provider call ───────────────────────────────────────────────────
export async function callModel(
  provider: string, modelName: string, prompt: string, cost?: ScanCostCollector,
): Promise<string> {

  if (provider === 'xai') {
    const res = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.XAI_API_KEY}`
      },
      body: JSON.stringify({
        model: modelName,
        tools: [{ type: 'web_search' }],
        input: prompt
      })
    })
    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`xAI error ${res.status}: ${errText}`)
    }
    const data = await res.json()
    // callModel's xAI branch also uses web_search — track it.
    cost?.add({ provider: 'xai', model: modelName, webSearch: true, data })
    const text = data.output
      ?.filter((b: any) => b.type === 'message')
      .flatMap((b: any) => b.content)
      .filter((c: any) => c.type === 'output_text')
      .map((c: any) => c.text)
      .join('') || ''
    return text
  }

  if (provider === 'gemini') {
    const modifiedPrompt = prompt + '\n\nחשוב: אל תכלול URLs בתגובה. השדה url יישאר ריק.'
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: modifiedPrompt }] }],
        tools: [{ google_search: {} }]
      })
    })
    if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`)
    const data = await res.json()

    // Extract real URLs from grounding metadata
    const chunks = data.candidates?.[0]?.groundingMetadata?.groundingChunks || []
    const realUrls: string[] = chunks.map((c: any) => c.web?.uri).filter(Boolean)

    // Get text response
    let text = data.candidates?.[0]?.content?.parts
      ?.filter((p: any) => p.text)
      .map((p: any) => p.text)
      .join('') || ''

    // Inject real URLs into parsed JSON by index
    try {
      const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const parsed = JSON.parse(clean)
      if (parsed.news) {
        parsed.news = parsed.news.map((item: any, i: number) => ({
          ...item,
          url: realUrls[i] || item.url || ''
        }))
        text = JSON.stringify(parsed)
      }
    } catch {}

    return text
  }

  if (provider === 'groq') {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4000
      })
    })
    const rawText = await res.text()
    console.log('Groq status:', res.status, rawText.slice(0, 200))
    if (!res.ok) throw new Error(`Groq error ${res.status}: ${rawText.slice(0, 200)}`)
    const data = JSON.parse(rawText)
    return data.choices?.[0]?.message?.content || ''
  }

  throw new Error(`Unknown provider: ${provider}`)
}
