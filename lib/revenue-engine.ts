/**
 * Revenue Intelligence Engine
 * Pure calculation module — no API calls, no DB access.
 * All inputs are pre-normalized by revenue-adapters.ts.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type RevenueLevel = 'נמוך' | 'בינוני' | 'גבוה' | 'חם מאוד'

export interface RevenueEngineInput {
  // ODS — Opportunity Demand Score
  trendGrowthRate: string              // 'עולה' | 'יציב' | 'יורד'
  searchVolumeScore: number            // 0–100+ (raw score or volume)
  geoSpreadScore: number               // regionCount
  signalVelocityScore: number          // total signals / signal-like items
  eventTenderPresenceScore: number     // combined tenders + conferences count

  // COMP — Competition Pressure
  competitorCountScore: number         // competitor count
  reviewQualityScore: number           // avg review rating 0–5
  brandStrengthScore: 'חלש' | 'בינוני' | 'חזק' | 'דומיננטי'

  // LPS — Lead Potential Score
  directLeadCountScore: number         // direct lead count
  tenderCountScore: number             // tender count
  eventNetworkingScore: number         // conference count

  // CPS — Close Probability Score
  leadQualityScore: 'נמוך' | 'בינוני' | 'טוב' | 'חזק'
  marketGapScore: 'קטן' | 'בינוני' | 'משמעותי' | 'חריג'
  urgencySignalScore: 'בלי דחיפות' | 'חלון הזדמנות חלש' | 'דחיפות ברורה' | 'חלון קצר / מתחרים נכנסים'

  // Meta
  signalCount: number
  timeToRevenueOverride?: { min: number; max: number }
}

export interface RevenueMetrics {
  revenuePotentialScore: number                                          // 0–100
  revenueLevel: RevenueLevel
  estimatedMonthlyRevenueMin: number                                     // ₪, rounded to 500
  estimatedMonthlyRevenueMax: number
  avgDealSize: number
  closeProbability: number                                               // 0–100
  confidenceScore: number                                                // 0–100
  timeToRevenueDays: { min: number; max: number }
  explanation: string[]                                                  // Hebrew sentences
}

// ── Normalization helpers ─────────────────────────────────────────────────────

export function normalizeTrendGrowthRate(direction: string): number {
  switch (direction) {
    case 'עולה': return 90
    case 'יציב': return 50
    case 'יורד': return 10
    default:      return 30
  }
}

export function normalizeSearchVolumeScore(volume: number): number {
  if (volume <= 0)   return 0
  if (volume <= 10)  return 25
  if (volume <= 25)  return 40
  if (volume <= 50)  return 55
  if (volume <= 75)  return 68
  if (volume <= 100) return 80
  if (volume <= 200) return 90
  return 100
}

export function normalizeGeoSpreadScore(regionCount: number): number {
  if (regionCount <= 0) return 10
  if (regionCount === 1) return 30
  if (regionCount <= 3) return 55
  if (regionCount <= 5) return 75
  return 95
}

export function normalizeSignalVelocityScore(signalsPerWeek: number): number {
  if (signalsPerWeek <= 0) return 0
  if (signalsPerWeek === 1) return 20
  if (signalsPerWeek === 2) return 40
  if (signalsPerWeek === 3) return 60
  if (signalsPerWeek <= 5) return 75
  if (signalsPerWeek <= 10) return 90
  return 100
}

export function normalizeEventTenderPresenceScore(count: number): number {
  if (count <= 0) return 0
  if (count === 1) return 30
  if (count === 2) return 55
  if (count === 3) return 75
  if (count <= 5) return 90
  return 100
}

export function normalizeCompetitorCountScore(count: number): number {
  if (count <= 0)  return 20   // no competitors = unproven market
  if (count <= 2)  return 40
  if (count <= 5)  return 65
  if (count <= 10) return 80
  return 95
}

export function normalizeReviewQualityScore(rating: number): number {
  if (rating <= 0)   return 20
  if (rating <= 1)   return 28
  if (rating <= 2)   return 42
  if (rating <= 3)   return 58
  if (rating <= 3.5) return 68
  if (rating <= 4)   return 78
  if (rating <= 4.5) return 87
  return 95
}

export function normalizeBrandStrengthScore(strength: 'חלש' | 'בינוני' | 'חזק' | 'דומיננטי'): number {
  switch (strength) {
    case 'חלש':     return 20
    case 'בינוני':  return 50
    case 'חזק':     return 75
    case 'דומיננטי': return 95
  }
}

export function normalizeDirectLeadCountScore(count: number): number {
  if (count <= 0)  return 0
  if (count <= 2)  return 25
  if (count <= 5)  return 50
  if (count <= 10) return 70
  if (count <= 20) return 85
  return 100
}

export function normalizeTenderCountScore(count: number): number {
  if (count <= 0) return 0
  if (count === 1) return 35
  if (count === 2) return 60
  if (count === 3) return 80
  return 100
}

export function normalizeEventNetworkingScore(count: number): number {
  if (count <= 0) return 0
  if (count === 1) return 30
  if (count === 2) return 55
  if (count === 3) return 75
  return 100
}

export function normalizeLeadQualityScore(quality: 'נמוך' | 'בינוני' | 'טוב' | 'חזק'): number {
  switch (quality) {
    case 'נמוך':   return 20
    case 'בינוני': return 45
    case 'טוב':    return 70
    case 'חזק':    return 90
  }
}

export function normalizeMarketGapScore(gap: 'קטן' | 'בינוני' | 'משמעותי' | 'חריג'): number {
  switch (gap) {
    case 'קטן':       return 20
    case 'בינוני':    return 45
    case 'משמעותי':   return 70
    case 'חריג':      return 95
  }
}

export function normalizeUrgencySignalScore(
  urgency: 'בלי דחיפות' | 'חלון הזדמנות חלש' | 'דחיפות ברורה' | 'חלון קצר / מתחרים נכנסים'
): number {
  switch (urgency) {
    case 'בלי דחיפות':                  return 15
    case 'חלון הזדמנות חלש':           return 40
    case 'דחיפות ברורה':               return 70
    case 'חלון קצר / מתחרים נכנסים':  return 95
  }
}

// ── Revenue level mapping ─────────────────────────────────────────────────────

function scoreToLevel(score: number): RevenueLevel {
  if (score >= 75) return 'חם מאוד'
  if (score >= 50) return 'גבוה'
  if (score >= 25) return 'בינוני'
  return 'נמוך'
}

function roundTo500(n: number): number {
  return Math.max(500, Math.round(n / 500) * 500)
}

// ── Explanation generator ─────────────────────────────────────────────────────

function buildExplanation(
  input: RevenueEngineInput,
  ODS: number,
  COMP: number,
  LPS: number,
  CPS: number,
  trendN: number,
  gapN: number,
  urgN: number
): string[] {
  const lines: string[] = []

  // Trend
  if (trendN >= 70) {
    lines.push('מגמת ביקוש עולה בתחום — ציון הזדמנות גבוה')
  } else if (trendN >= 40) {
    lines.push('מגמת ביקוש יציבה בתחום — ציון הזדמנות בינוני')
  } else {
    lines.push('מגמת ביקוש נמוכה בתחום — ציון הזדמנות מוגבל')
  }

  // Signal velocity
  if (input.signalVelocityScore >= 4) {
    lines.push(`זוהו ${input.signalVelocityScore} סיגנלים שוק — פעילות גבוהה בתחום`)
  } else if (input.signalVelocityScore >= 2) {
    lines.push(`זוהו ${input.signalVelocityScore} סיגנלים שוק — פעילות בינונית בתחום`)
  }

  // Competition
  if (input.competitorCountScore >= 7) {
    lines.push(`${input.competitorCountScore} מתחרים פעילים — לחץ תחרות גבוה`)
  } else if (input.competitorCountScore >= 3) {
    lines.push(`${input.competitorCountScore} מתחרים פעילים — לחץ תחרות בינוני`)
  } else if (input.competitorCountScore >= 1) {
    lines.push(`${input.competitorCountScore} מתחרים — תחרות נמוכה, שוק פתוח`)
  }

  // Tenders
  if (input.tenderCountScore >= 2) {
    lines.push(`${input.tenderCountScore} מכרזים פתוחים — פוטנציאל לידים חזק`)
  } else if (input.tenderCountScore === 1) {
    lines.push('מכרז פתוח אחד — פוטנציאל ליד בינוני')
  }

  // Direct leads
  if (input.directLeadCountScore >= 8) {
    lines.push(`${input.directLeadCountScore} לידים ישירים — פוטנציאל הכנסה גבוה`)
  } else if (input.directLeadCountScore >= 4) {
    lines.push(`${input.directLeadCountScore} לידים ישירים — פוטנציאל הכנסה בינוני`)
  }

  // Market gap
  if (gapN >= 70) {
    lines.push('פער שוק משמעותי — הביקוש עולה על ההיצע הקיים')
  } else if (gapN >= 40) {
    lines.push('פער שוק בינוני — קיימת הזדמנות כניסה')
  }

  // Urgency
  if (urgN >= 70) {
    lines.push('דחיפות גבוהה — חלון הזדמנות פתוח עכשיו')
  } else if (urgN >= 40) {
    lines.push('חלון הזדמנות קיים — פעולה מהירה תשפר תוצאות')
  }

  // ODS summary
  const odsLevel = ODS >= 65 ? 'גבוה' : ODS >= 40 ? 'בינוני' : 'נמוך'
  lines.push(`ציון ביקוש כולל (ODS): ${Math.round(ODS)} — ${odsLevel}`)

  return lines
}

// ── Main function ─────────────────────────────────────────────────────────────

export function calculateRevenueMetrics(input: RevenueEngineInput): RevenueMetrics {
  // ODS — Opportunity Demand Score (0–100)
  const trendN  = normalizeTrendGrowthRate(input.trendGrowthRate)
  const volumeN = normalizeSearchVolumeScore(input.searchVolumeScore)
  const geoN    = normalizeGeoSpreadScore(input.geoSpreadScore)
  const velN    = normalizeSignalVelocityScore(input.signalVelocityScore)
  const eventN  = normalizeEventTenderPresenceScore(input.eventTenderPresenceScore)
  const ODS = trendN * 0.30 + volumeN * 0.20 + geoN * 0.15 + velN * 0.25 + eventN * 0.10

  // COMP — Competition Pressure (0–100, higher = more competition)
  const compCountN = normalizeCompetitorCountScore(input.competitorCountScore)
  const reviewN    = normalizeReviewQualityScore(input.reviewQualityScore)
  const brandN     = normalizeBrandStrengthScore(input.brandStrengthScore)
  const COMP = compCountN * 0.40 + reviewN * 0.30 + brandN * 0.30

  // LPS — Lead Potential Score (0–100)
  const leadN    = normalizeDirectLeadCountScore(input.directLeadCountScore)
  const tenderN  = normalizeTenderCountScore(input.tenderCountScore)
  const eventNetN = normalizeEventNetworkingScore(input.eventNetworkingScore)
  const LPS = leadN * 0.45 + tenderN * 0.30 + eventNetN * 0.25

  // CPS — Close Probability Score (0–100)
  const leadQN = normalizeLeadQualityScore(input.leadQualityScore)
  const gapN   = normalizeMarketGapScore(input.marketGapScore)
  const urgN   = normalizeUrgencySignalScore(input.urgencySignalScore)
  const CPS = leadQN * 0.35 + gapN * 0.35 + urgN * 0.30

  // RevenuePotentialScore — composite
  const revenuePotentialScore = Math.min(100, Math.max(0,
    Math.round(ODS * 0.30 + LPS * 0.30 + CPS * 0.25 + (100 - COMP) * 0.15)
  ))

  const revenueLevel = scoreToLevel(revenuePotentialScore)

  // avgDealSize — ₪3,000–₪50,000 range based on LPS + CPS
  const dealFactor = (LPS * 0.5 + CPS * 0.5) / 100
  const avgDealSize = roundTo500(3000 + dealFactor * 47000)

  // closeProbability — capped at 85%
  const closeProbability = Math.min(85, Math.round(CPS * 0.75 + 10))

  // estimatedMonthlyRevenue
  const leadsPerMonth = Math.max(1, Math.round(input.directLeadCountScore / 3))
  const estimatedBase = leadsPerMonth * (closeProbability / 100) * avgDealSize
  const estimatedMonthlyRevenueMin = roundTo500(estimatedBase * 0.65)
  const estimatedMonthlyRevenueMax = roundTo500(estimatedBase * 1.35)

  // confidenceScore — based on signal count
  const sc = input.signalCount
  const confidenceScore = Math.min(95,
    sc <= 0  ? 20 :
    sc <= 2  ? 40 :
    sc <= 4  ? 60 :
    sc <= 7  ? 75 :
    sc <= 10 ? 85 : 90
  )

  // timeToRevenueDays
  let timeToRevenueDays: { min: number; max: number }
  if (input.timeToRevenueOverride) {
    timeToRevenueDays = input.timeToRevenueOverride
  } else if (CPS >= 70 && LPS >= 60) {
    timeToRevenueDays = { min: 14, max: 45 }
  } else if (CPS >= 50) {
    timeToRevenueDays = { min: 30, max: 75 }
  } else if (CPS >= 30) {
    timeToRevenueDays = { min: 45, max: 90 }
  } else {
    timeToRevenueDays = { min: 60, max: 120 }
  }

  const explanation = buildExplanation(input, ODS, COMP, LPS, CPS, trendN, gapN, urgN)

  return {
    revenuePotentialScore,
    revenueLevel,
    estimatedMonthlyRevenueMin,
    estimatedMonthlyRevenueMax,
    avgDealSize,
    closeProbability,
    confidenceScore,
    timeToRevenueDays,
    explanation,
  }
}
