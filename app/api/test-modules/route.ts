export const dynamic = 'force-dynamic'

const KEY = () => process.env.GOOGLE_PLACES_API_KEY ?? ''
const GKEY = () => process.env.GEMINI_API_KEY ?? ''

export async function GET() {
  const out: Record<string, unknown> = {}

  // Ask Gemini to specifically find the Google My Business page or Maps URL for basalon.co.il
  out.gemini_find_gmb = await (async () => {
    const prompt = `I need to find the exact Google Maps (Google My Business) listing for basalon.co.il — an Israeli online platform for workshops and experiences.
Please search for:
1. "basalon.co.il google maps"
2. "בסלון site:google.com/maps"
3. The Google Maps URL in basalon.co.il's website footer or contact page
4. Any review sites (e.g. Google reviews for basalon)

If you find a Google Maps URL or place_id for this business, return JSON: {"maps_url": "...", "rating": X.X, "review_count": Y}
If not found, return: {"maps_url": null, "rating": null, "review_count": null}`
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GKEY()}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ googleSearch: {} }],
        }),
      }
    )
    const d = await res.json()
    if (d.error) return { error: d.error }
    const text = d.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text ?? ''
    const groundingChunks = d.candidates?.[0]?.groundingMetadata?.groundingChunks?.slice(0, 5) ?? []
    return { text: text.slice(0, 800), sources: groundingChunks.map((c: any) => c.web?.uri) }
  })().catch(e => `error: ${e.message}`)

  // Also try: textsearch for the exact address range (Tel Aviv tech companies)
  out.textsearch_platform = await (async () => {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent('בסלון ישראל פלטפורמה')}&key=${KEY()}`
    )
    const d = await res.json()
    return (d.results ?? []).slice(0, 3).map((r: any) => ({ name: r.name, rating: r.rating, count: r.user_ratings_total, id: r.place_id, address: r.formatted_address }))
  })().catch(e => `error: ${e.message}`)

  return Response.json(out)
}
