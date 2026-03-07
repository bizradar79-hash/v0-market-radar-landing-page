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

function is429(e: any): boolean {
  return (
    e?.status === 429 ||
    e?.message?.includes('429') ||
    e?.message?.includes('RESOURCE_EXHAUSTED') ||
    e?.message?.toLowerCase().includes('rate limit') ||
    e?.message?.toLowerCase().includes('quota')
  )
}

async function callGroq(prompt: string): Promise<{ text: string; tokens: number }> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! })
  const result = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
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
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!)
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
  let raw: string

  try {
    const { text, tokens } = await callGroq(prompt)
    raw = text
    trackUsage('groq', tokens).catch(() => {})
  } catch (groqErr: any) {
    if (!is429(groqErr)) throw groqErr

    console.warn('Groq 429 — falling back to Gemini')
    try {
      const { text, tokens } = await callGemini(prompt)
      raw = text
      trackUsage('gemini', tokens).catch(() => {})
    } catch (geminiErr: any) {
      if (is429(geminiErr)) {
        throw new Error('BOTH_PROVIDERS_EXHAUSTED')
      }
      throw geminiErr
    }
  }

  const extracted = extractJSON(raw)
  if (!extracted) {
    console.error('analyzeWithAI: could not extract JSON from:', raw.slice(0, 500))
    throw new Error(`Model did not return valid JSON. Raw: ${raw.slice(0, 200)}`)
  }

  return extracted
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
