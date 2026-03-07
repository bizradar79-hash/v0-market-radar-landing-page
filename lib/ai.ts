import Groq from 'groq-sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { trackUsage } from './usage'

const SYSTEM_PROMPT = `אתה יועץ אסטרטגי בכיר המתמחה בשוק הישראלי.
כללי ברזל:
1. אף פעם אל תמציא URLs, שמות חברות או נתונים שלא קיבלת
2. השתמש רק במידע שסופק לך
3. החזר JSON תקני בלבד - ללא markdown, ללא הסברים, ללא טקסט לפני או אחרי ה-JSON
4. התחל את התשובה ישירות עם { ו-סיים עם }
5. דבר בעברית`

// Ordered fallback chain — each has a separate Groq quota
const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']

function is429(e: any): boolean {
  return e?.status === 429 || String(e?.message ?? '').includes('[429')
}

async function callGroq(prompt: string, model: string): Promise<{ text: string; tokens: number }> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! })
  // Smaller model needs stronger English JSON instruction prepended to the user message
  const userContent = model === 'llama-3.1-8b-instant'
    ? `CRITICAL: Output ONLY a valid JSON object. Start your response with { and end with }. No introduction, no explanation, no numbered list, no markdown. Just raw JSON.\n\n${prompt}`
    : prompt
  const result = await groq.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
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
  // Try each Groq model in order
  for (const model of GROQ_MODELS) {
    try {
      const { text, tokens } = await callGroq(prompt, model)
      trackUsage('groq', tokens).catch(() => {})
      const extracted = extractJSON(text)
      if (!extracted) throw new Error(`Model did not return valid JSON. Raw: ${text.slice(0, 200)}`)
      return extracted
    } catch (e: any) {
      if (is429(e)) {
        console.warn(`Groq ${model} → 429, trying next provider`)
        continue
      }
      throw e
    }
  }

  // All Groq models exhausted — try Gemini
  console.warn('All Groq models exhausted, falling back to Gemini')
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
