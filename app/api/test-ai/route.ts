import Groq from 'groq-sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextResponse } from 'next/server'

export async function GET() {
  const results: Record<string, any> = {}

  // Test Groq
  try {
    if (!process.env.GROQ_API_KEY) {
      results.groq = { ok: false, error: 'GROQ_API_KEY not set' }
    } else {
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: 'say "ok"' }],
        max_tokens: 5,
      })
      results.groq = { ok: true, text: completion.choices[0].message.content, tokens: completion.usage?.total_tokens }
    }
  } catch (e: any) {
    results.groq = { ok: false, status: e?.status, error: e?.message?.slice(0, 300) }
  }

  // Test Gemini
  try {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!key) {
      results.gemini = { ok: false, error: 'GOOGLE_GENERATIVE_AI_API_KEY not set' }
    } else {
      const genAI = new GoogleGenerativeAI(key)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
      const result = await model.generateContent('say "ok"')
      results.gemini = { ok: true, text: result.response.text(), tokens: result.response.usageMetadata?.totalTokenCount }
    }
  } catch (e: any) {
    results.gemini = { ok: false, status: e?.status, error: e?.message?.slice(0, 300) }
  }

  return NextResponse.json(results)
}
