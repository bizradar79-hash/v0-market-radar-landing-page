import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const key = process.env.GEMINI_API_KEY
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`
    )
    const data = await res.json()
    return NextResponse.json({ key_exists: !!key, key_length: key?.length, google_response: data })
  } catch (e: any) {
    return NextResponse.json({ key_exists: !!key, error: e.message })
  }
}
