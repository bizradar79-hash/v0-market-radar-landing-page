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

const SYSTEM_PROMPT = `אתה יועץ אסטרטגי בכיר המתמחה בשוק הישראלי.
כללי ברזל:
1. אף פעם אל תמציא URLs, שמות חברות או נתונים שלא קיבלת
2. השתמש רק במידע שסופק לך
3. החזר JSON תקני בלבד - ללא markdown, ללא הסברים, ללא טקסט לפני או אחרי ה-JSON
4. התחל את התשובה ישירות עם { ו-סיים עם }
5. דבר בעברית`

// llama-3.1-8b-instant has a 6k TPM limit — too low for real search data; skip it
const GROQ_MODEL = 'llama-3.3-70b-versatile'

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
    max_tokens: 4000,
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
  // Try Groq first
  try {
    const { text, tokens } = await callGroq(prompt)
    trackUsage('groq', tokens).catch(() => {})
    const extracted = extractJSON(text)
    if (!extracted) throw new Error(`Model did not return valid JSON. Raw: ${text.slice(0, 200)}`)
    return extracted
  } catch (e: any) {
    if (!is429(e)) throw e
    console.warn('Groq → 429, falling back to Gemini')
  }

  // Groq exhausted — try Gemini
  console.warn('Falling back to Gemini')
  try {
    const { text, tokens } = await callGemini(prompt)
    trackUsage('gemini', tokens).catch(() => {})
    const extracted = extractJSON(text)
    if (!extracted) throw new Error(`Gemini did not return valid JSON. Raw: ${text.slice(0, 200)}`)
    return extracted
  } catch (e: any) {
    if (is429(e)) throw new Error('BOTH_PROVIDERS_EXHAUSTED')
    throw e
  }
}

function extractJSON(text: string): any {
  let clean = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim()

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
