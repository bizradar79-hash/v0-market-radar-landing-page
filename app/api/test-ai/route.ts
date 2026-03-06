import Groq from 'groq-sdk'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ ok: false, error: 'GROQ_API_KEY not set' })
    }
    
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: 'שלום, תגיד מילה אחת בעברית' }],
      temperature: 0.7,
    })
    
    return NextResponse.json({ ok: true, text: completion.choices[0].message.content })
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ ok: false, error })
  }
}
