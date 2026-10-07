export const dynamic = 'force-dynamic'

import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextResponse } from 'next/server'

export async function GET() {
  const results: Record<string, any> = {}

  // Groq is no longer used (no access to its llama models).
  results.groq = { ok: true, note: 'not used — AI runs on Gemini → xAI' }

  // Test Gemini — use large prompt to stress-test it
  try {
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!key) {
      results.gemini = { ok: false, error: 'GOOGLE_GENERATIVE_AI_API_KEY not set' }
    } else {
      const genAI = new GoogleGenerativeAI(key)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
      const result = await model.generateContent('say "ok"')
      results.gemini = { ok: true, text: result.response.text(), tokens: result.response.usageMetadata?.totalTokenCount }
    }
  } catch (e: any) {
    results.gemini = {
      ok: false,
      type: e?.constructor?.name,
      status: e?.status,
      httpStatus: e?.httpStatus,
      code: e?.code,
      message: String(e?.message ?? '').slice(0, 400),
      is429: e?.status === 429 || e?.status === 413 || String(e?.message ?? '').includes('[429') || String(e?.message ?? '').includes('[413'),
    }
  }

  return NextResponse.json(results)
}
