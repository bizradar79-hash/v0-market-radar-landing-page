export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const results: any = {}
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  // Test 1: GEO query generation
  try {
    const geoRes = await fetch(`${base}/api/generate-geo-ranking`, { method: 'POST' })
    const geoData = await geoRes.json()
    results.geo_query = geoData?.query ?? geoData?.question ?? 'missing'
    results.geo_engines = Object.keys(geoData?.engines ?? {}).map(k => ({
      engine: k,
      count: geoData.engines[k]?.results?.length ?? geoData.engines[k]?.length ?? 0,
      appeared: geoData.engines[k]?.appeared ?? false,
    }))
  } catch (e: any) { results.geo_error = e.message }

  // Test 2: Review analysis
  try {
    const revRes = await fetch(`${base}/api/analyze-company-reviews?force=true`, { method: 'POST' })
    const revData = await revRes.json()
    results.reviews = {
      has_sources: (revData?.sources?.length ?? 0) > 0,
      source_count: revData?.sources?.length ?? 0,
      fallback_only: !revData?.sources?.length,
      weighted_average: revData?.weighted_average ?? null,
      google_rating: revData?.google_rating ?? null,
    }
  } catch (e: any) { results.reviews_error = e.message }

  return Response.json(results)
}
