import { GoogleGenerativeAI } from '@google/generative-ai'
import { trackUsage } from './usage'

export async function validateUrl(url: string): Promise<boolean> {
  if (!url || !url.startsWith('http')) return false
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(3000),
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    if (res.status === 405) {
      const res2 = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
        headers: { 'User-Agent': 'Mozilla/5.0' },
      })
      return res2.ok
    }
    return res.ok
  } catch {
    return false
  }
}

const SYSTEM_PROMPT = `You are an Israeli market expert. Return ONLY valid JSON, no markdown, no explanation. Start with { or [ and end with } or ].`

// Groq is NOT used: our account no longer has access to llama-3.3-70b-versatile
// ("model does not exist or you do not have access"), which broke every
// analyzeWithAI caller (business overview, SWOT, …). The chain is now the two
// providers that work in production elsewhere: Gemini (GEMINI_API_KEY) first,
// xAI Grok as fallback.
const GEMINI_MODEL = 'gemini-2.5-flash'
const XAI_MODEL = 'grok-4-fast-non-reasoning'

async function callGemini(prompt: string): Promise<{ text: string; tokens: number }> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY not set')
  const genAI = new GoogleGenerativeAI(key)
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL, systemInstruction: SYSTEM_PROMPT })
  const result = await model.generateContent(prompt)
  return {
    text: result.response.text(),
    tokens: result.response.usageMetadata?.totalTokenCount ?? 0,
  }
}

/** Plain xAI completion (no web_search — these are analysis prompts). */
async function callXai(prompt: string): Promise<{ text: string; tokens: number }> {
  if (!process.env.XAI_API_KEY) throw new Error('XAI_API_KEY not set')
  const res = await fetch('https://api.x.ai/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.XAI_API_KEY}` },
    body: JSON.stringify({
      model: XAI_MODEL,
      input: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(50_000),
  })
  if (!res.ok) throw new Error(`xAI error ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  const text = (data.output || [])
    .filter((i: any) => i.type === 'message')
    .flatMap((i: any) => i.content)
    .filter((c: any) => c.type === 'output_text')
    .map((c: any) => c.text)
    .join('')
  return { text, tokens: data.usage?.total_tokens ?? 0 }
}

/**
 * JSON analysis call: Gemini → xAI. The optional second argument (a legacy
 * Groq model name) is accepted for call-site compatibility and ignored.
 */
export async function analyzeWithAI(prompt: string, _legacyModel?: string): Promise<any> {
  let geminiErr: any
  try {
    const { text, tokens } = await callGemini(prompt)
    trackUsage('gemini', tokens).catch(() => {})
    const extracted = extractJSON(text)
    if (!extracted) throw new Error(`Gemini did not return valid JSON. Raw: ${text.slice(0, 200)}`)
    return extracted
  } catch (e: any) {
    geminiErr = e
    console.warn('[analyzeWithAI] Gemini failed, falling back to xAI:', e?.message)
  }

  try {
    const { text } = await callXai(prompt)
    const extracted = extractJSON(text)
    if (!extracted) throw new Error(`xAI did not return valid JSON. Raw: ${text.slice(0, 200)}`)
    return extracted
  } catch (xaiErr: any) {
    throw new Error(
      `AI_PROVIDERS_FAILED | gemini: ${String(geminiErr?.message ?? '').slice(0, 150)} | xai: ${String(xaiErr?.message ?? '').slice(0, 150)}`,
    )
  }
}

function extractJSON(text: string): any {
  let clean = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim()

  // Repair Hebrew gershayim: " between word chars (e.g. ע"ש) breaks JSON strings
  // \u0590-\u05FF covers Hebrew Unicode range
  clean = clean.replace(/([\w\u0590-\u05FF])"([\w\u0590-\u05FF])/g, '$1\\"$2')

  try {
    return JSON.parse(clean)
  } catch {}

  const firstBrace = clean.indexOf('{')
  const firstBracket = clean.indexOf('[')
  let start = -1

  if (firstBrace === -1 && firstBracket === -1) return null
  if (firstBrace === -1) start = firstBracket
  else if (firstBracket === -1) start = firstBrace
  else start = Math.min(firstBrace, firstBracket)

  const openChar = clean[start]
  const closeChar = openChar === '{' ? '}' : ']'
  const end = clean.lastIndexOf(closeChar)

  if (end <= start) return null

  try {
    return JSON.parse(clean.slice(start, end + 1))
  } catch {
    return null
  }
}
