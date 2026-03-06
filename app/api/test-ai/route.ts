import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return NextResponse.json({ ok: false, error: 'GOOGLE_GENERATIVE_AI_API_KEY not set' })
    }
    
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
    const result = await model.generateContent('שלום, תגיד מילה אחת בעברית')
    
    return NextResponse.json({ ok: true, text: result.response.text() })
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ ok: false, error })
  }
}
