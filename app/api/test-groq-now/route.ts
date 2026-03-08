import { NextResponse } from 'next/server'
import Groq from 'groq-sdk'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
    const result = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: 'say hello in one word' }],
      max_tokens: 10
    })
    return NextResponse.json({
      ok: true,
      response: result.choices[0].message.content,
      usage: result.usage
    })
  } catch(e: any) {
    return NextResponse.json({
      ok: false,
      status: e?.status,
      message: e?.message,
      error: JSON.stringify(e?.error)
    })
  }
}
