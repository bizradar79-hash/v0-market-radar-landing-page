export const dynamic = 'force-dynamic'

export async function GET() {
  const results: any = {}
  const key = process.env.GEMINI_API_KEY

  if (!key) {
    return Response.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 })
  }

  // Test 1: GEO query generation
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'פלטפורמה מקוונת לסדנאות ישראל — תן שאילתת חיפוש קצרה של 3-5 מילים בלבד' }] }],
          generationConfig: { maxOutputTokens: 50 },
        }),
      }
    )
    const data = await res.json()
    results.geo_query_test = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? 'no response'
    if (data?.error) results.geo_query_api_error = data.error
  } catch (e: any) { results.geo_query_error = e.message }

  // Test 2: Reviews via Gemini JSON mode
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'מה הדירוג של basalon.co.il בגוגל מאפס? כמה ביקורות? החזר JSON: {"google_rating": X, "google_review_count": Y}' }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      }
    )
    const data = await res.json()
    results.reviews_test = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? 'no response'
    if (data?.error) results.reviews_api_error = data.error
  } catch (e: any) { results.reviews_error = e.message }

  return Response.json(results)
}
