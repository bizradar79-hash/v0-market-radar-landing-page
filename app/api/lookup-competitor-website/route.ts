export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

export const maxDuration = 30

export async function POST(request: Request) {
  try {
    const { name } = await request.json()
    if (!name) return NextResponse.json({ website: null })

    const geminiKey = process.env.GEMINI_API_KEY
    if (!geminiKey) return NextResponse.json({ website: null })

    const prompt = `מה האתר הרשמי של "${name}" בישראל? החזר רק את ה-URL, ללא הסברים.`

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    )
    const data = await res.json()
    const text = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim()

    // Extract a URL from the response
    const urlMatch = text.match(/https?:\/\/[^\s]+/)
    const website = urlMatch ? urlMatch[0].replace(/[.,;]+$/, '') : null

    return NextResponse.json({ website })
  } catch {
    return NextResponse.json({ website: null })
  }
}
