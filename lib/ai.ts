import Groq from 'groq-sdk'
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

const GROQ_MODEL = 'llama-3.3-70b-versatile'

async function callWithRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (e: any) {
      if (is429(e) && i < retries - 1) {
        const delay = 20000 // 20s — enough for TPM window to partially clear
        console.warn(`[AI] Rate limited (attempt ${i + 1}/${retries}), waiting ${delay / 1000}s...`)
        await new Promise(r => setTimeout(r, delay))
        continue
      }
      throw e
    }
  }
  throw new Error('callWithRetry: unreachable')
}

function is429(e: any): boolean {
  const status = e?.status
  const msg = String(e?.message ?? '')
  // 429 = rate limit; Groq also sends 413 for TPM-exceeded (treat same as rate limit)
  return status === 429 || status === 413 || msg.includes('[429') || msg.includes('[413')
}

async function callGroq(prompt: string): Promise<{ text: string; tokens: number }> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! })
  const result = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
    max_tokens: 3000,
  })
  return {
    text: result.choices[0].message.content ?? '',
    tokens: result.usage?.total_tokens ?? 0,
  }
}

async function callGemini(prompt: string): Promise<{ text: string; tokens: number }> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) throw new Error('GEMINI_KEY_NOT_SET')
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY)
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: SYSTEM_PROMPT,
  })
  const result = await model.generateContent(prompt)
  return {
    text: result.response.text(),
    tokens: result.response.usageMetadata?.totalTokenCount ?? 0,
  }
}

export async function analyzeWithAI(prompt: string): Promise<any> {
  let groqErr: any
  // Try Groq with retry on TPM (up to 2 attempts, 20s apart)
  try {
    const { text, tokens } = await callWithRetry(() => callGroq(prompt), 2)
    trackUsage('groq', tokens).catch(() => {})
    const extracted = extractJSON(text)
    if (!extracted) throw new Error(`Model did not return valid JSON. Raw: ${text.slice(0, 200)}`)
    return extracted
  } catch (e: any) {
    groqErr = e
    if (!is429(e)) throw e
  }

  // Gemini fallback — single attempt only (daily quota won't recover in seconds)
  try {
    const { text, tokens } = await callGemini(prompt)
    trackUsage('gemini', tokens).catch(() => {})
    const extracted = extractJSON(text)
    if (!extracted) throw new Error(`Gemini did not return valid JSON. Raw: ${text.slice(0, 200)}`)
    return extracted
  } catch (geminiErr: any) {
    const groqDetail = `groq_status=${groqErr?.status} groq_msg=${String(groqErr?.message ?? '').slice(0, 150)}`
    const geminiDetail = `gemini_status=${geminiErr?.status} gemini_msg=${String(geminiErr?.message ?? '').slice(0, 150)}`
    if (is429(geminiErr)) throw new Error(`BOTH_PROVIDERS_EXHAUSTED | ${groqDetail} | ${geminiDetail}`)
    throw geminiErr
  }
}

function extractJSON(text: string): any {
  let clean = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim()

  // Repair Hebrew gershayim: " between word chars (e.g. ע"ש) breaks JSON strings
  clean = clean.replace(/(\w)"(\w)/g, '$1\\"$2')

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
