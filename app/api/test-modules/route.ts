export const dynamic = 'force-dynamic'

const GEMINI_KEY = () => process.env.GEMINI_API_KEY ?? ''

export async function GET() {
  const out: Record<string, unknown> = { gemini_key_set: !!GEMINI_KEY() }

  // Test 1: Gemini with google_search (snake_case)
  out.gemini_snake = await (async () => {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY()}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Find the Google Maps rating for the business "בסלון - basalon" whose website is basalon.co.il. Return only: {"rating": X.X, "review_count": Y}' }] }],
          tools: [{ google_search: {} }],
        }),
      }
    )
    const d = await res.json()
    if (d.error) return { error: d.error }
    const text = d.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text ?? ''
    return { text: text.slice(0, 500), finish_reason: d.candidates?.[0]?.finishReason }
  })().catch(e => `error: ${e.message}`)

  // Test 2: Gemini with googleSearch (camelCase)
  out.gemini_camel = await (async () => {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY()}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Find the Google Maps rating for the business "בסלון - basalon" whose website is basalon.co.il. Return only: {"rating": X.X, "review_count": Y}' }] }],
          tools: [{ googleSearch: {} }],
        }),
      }
    )
    const d = await res.json()
    if (d.error) return { error: d.error }
    const text = d.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text ?? ''
    return { text: text.slice(0, 500), finish_reason: d.candidates?.[0]?.finishReason }
  })().catch(e => `error: ${e.message}`)

  // Test 3: Gemini without search tools (just knowledge)
  out.gemini_no_search = await (async () => {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY()}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'What is the Google Maps rating for the business "בסלון - basalon" whose website is basalon.co.il in Israel? Return only: {"rating": X.X, "review_count": Y}' }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      }
    )
    const d = await res.json()
    if (d.error) return { error: d.error }
    const text = d.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    return { text: text.slice(0, 300) }
  })().catch(e => `error: ${e.message}`)

  return Response.json(out)
}
