interface TrendsInput {
  search_data: { keyword: string; volume?: number; trend?: string }[]
  social_reviews: string[]
  competitors: { name: string; products: string[] }[]
  manual_keywords?: string[]
}

interface ValidationResult {
  valid: boolean
  hallucination_flags: { field: string; value: string; reason: string }[]
  confidence_reduction: number
}

export function validateTrendsOutput(aiOutput: any, originalInput: TrendsInput): ValidationResult {
  const flags: ValidationResult["hallucination_flags"] = []

  const inputCorpus = [
    ...originalInput.social_reviews,
    ...originalInput.search_data.map((k) => k.keyword),
    ...originalInput.competitors.flatMap((c) => [c.name, ...c.products]),
    ...(originalInput.manual_keywords ?? []),
  ].join(" ").toLowerCase()

  const inputKeywords = new Set(originalInput.search_data.map((k) => k.keyword.toLowerCase()))

  // Validate customer quotes exist in social_reviews
  for (const need of aiOutput.unmet_needs ?? []) {
    const quote = need.customer_quote?.toLowerCase() ?? ""
    const existsInReviews = originalInput.social_reviews.some((r) =>
      r.toLowerCase().includes(quote.slice(0, 30))
    )
    if (!existsInReviews && quote.length > 10) {
      flags.push({
        field: "unmet_needs.customer_quote",
        value: need.customer_quote,
        reason: "Quote not found in social_reviews input",
      })
    }
  }

  // Validate keywords exist in search_data
  for (const kw of [...(aiOutput.keyword_map?.quick_wins ?? []), ...(aiOutput.keyword_map?.high_volume ?? [])]) {
    if (!inputKeywords.has(kw.keyword?.toLowerCase() ?? "")) {
      flags.push({
        field: "keyword_map",
        value: kw.keyword,
        reason: "Keyword not found in search_data input",
      })
    }
  }

  // Validate emerging trends evidence is grounded in input
  for (const trend of aiOutput.emerging_trends ?? []) {
    const evidenceWords = (trend.evidence?.toLowerCase() ?? "").split(" ").filter((w: string) => w.length > 4)
    const matchRatio = evidenceWords.filter((w: string) => inputCorpus.includes(w)).length / Math.max(evidenceWords.length, 1)
    if (matchRatio < 0.3 && !trend.hallucination_risk) {
      flags.push({
        field: "emerging_trends.evidence",
        value: trend.trend_name,
        reason: `Evidence match ratio too low (${Math.round(matchRatio * 100)}%) — possible hallucination`,
      })
    }
  }

  // Validate manual keywords were in input
  for (const mk of aiOutput.manual_keyword_analysis ?? []) {
    const inInput = originalInput.manual_keywords?.some((k) => k.toLowerCase() === mk.keyword?.toLowerCase())
    if (!inInput) {
      flags.push({
        field: "manual_keyword_analysis",
        value: mk.keyword,
        reason: "Keyword not in manual_keywords input",
      })
    }
  }

  return {
    valid: flags.length === 0,
    hallucination_flags: flags,
    confidence_reduction: Math.min(flags.length * 15, 80),
  }
}
