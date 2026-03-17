/**
 * Revenue Engine Adapters
 * Extract RevenueEngineInput from each domain object type.
 */

import type { RevenueEngineInput } from './revenue-engine'
import type { NicheOpportunity } from '@/types/niche-opportunity'
import type { MarketAnalysis } from '@/types/market-analysis'
import type { WeeklyAction } from '@/types/weekly-actions'

/** Parse midpoint from strings like "8–15 לידים" or "~10 לידים" → 10 */
function parseLeadRangeMidpoint(str: string): number {
  if (!str) return 0
  const range = str.match(/(\d+)\s*[–\-]\s*(\d+)/)
  if (range) return Math.round((parseInt(range[1]) + parseInt(range[2])) / 2)
  const single = str.match(/(\d+)/)
  if (single) return parseInt(single[1])
  return 0
}

function regionToCount(region: string): number {
  if (!region) return 2
  if (region === 'גלובלי') return 6
  if (region.includes('כל ישראל') || region === 'ישראל') return 4
  return 1
}

// ── Niche adapter ─────────────────────────────────────────────────────────────

export function revenueInputFromNiche(niche: NicheOpportunity): RevenueEngineInput {
  const tenderSignals    = niche.signals.filter(s => s.type === 'tender').length
  const conferenceSignals = niche.signals.filter(s => s.type === 'conference').length
  const competitorSignals = niche.signals.filter(s => s.type === 'competitor').length

  const competitorCount = Math.max(niche.relatedCompetitors.length, competitorSignals)

  const leadMid = parseLeadRangeMidpoint(niche.estimatedLeadPotential)

  const brandStrength: RevenueEngineInput['brandStrengthScore'] =
    niche.competitionLevel === 'גבוהה'   ? 'חזק' :
    niche.competitionLevel === 'בינונית' ? 'בינוני' : 'חלש'

  const leadQuality: RevenueEngineInput['leadQualityScore'] =
    niche.confidenceScore >= 75 ? 'חזק' :
    niche.confidenceScore >= 55 ? 'טוב' :
    niche.confidenceScore >= 35 ? 'בינוני' : 'נמוך'

  const marketGap: RevenueEngineInput['marketGapScore'] =
    niche.competitionLevel === 'נמוכה'   ? 'חריג' :
    niche.competitionLevel === 'בינונית' ? 'משמעותי' : 'בינוני'

  const urgency: RevenueEngineInput['urgencySignalScore'] =
    niche.demandTrend === 'עולה' ? 'דחיפות ברורה' :
    niche.demandTrend === 'יורד' ? 'בלי דחיפות' : 'חלון הזדמנות חלש'

  return {
    trendGrowthRate:          niche.demandTrend,
    searchVolumeScore:        niche.opportunityScore,
    geoSpreadScore:           regionToCount(niche.region),
    signalVelocityScore:      niche.signals.length,
    eventTenderPresenceScore: tenderSignals + conferenceSignals,

    competitorCountScore:     competitorCount,
    reviewQualityScore:       3.5,
    brandStrengthScore:       brandStrength,

    directLeadCountScore:  leadMid,
    tenderCountScore:      tenderSignals,
    eventNetworkingScore:  conferenceSignals,

    leadQualityScore:   leadQuality,
    marketGapScore:     marketGap,
    urgencySignalScore: urgency,

    signalCount: niche.signals.length,
  }
}

// ── Market Analysis adapter ───────────────────────────────────────────────────

export function revenueInputFromMarketAnalysis(analysis: MarketAnalysis): RevenueEngineInput {
  const signals = analysis.signals ?? []
  const tenderSignals     = signals.filter(s => s.type === 'tender').length
  const conferenceSignals = signals.filter(s => s.type === 'conference').length
  const competitorSignals = signals.filter(s => s.type === 'competitor').length

  const trendGrowth =
    analysis.marketMomentum === 'עולה'   ? 'עולה' :
    analysis.marketMomentum === 'בירידה' ? 'יורד' : 'יציב'

  const brandStrength: RevenueEngineInput['brandStrengthScore'] =
    analysis.competitionScore >= 75 ? 'דומיננטי' :
    analysis.competitionScore >= 55 ? 'חזק' :
    analysis.competitionScore >= 35 ? 'בינוני' : 'חלש'

  const leadQuality: RevenueEngineInput['leadQualityScore'] =
    analysis.gapScore >= 75 ? 'חזק' :
    analysis.gapScore >= 55 ? 'טוב' :
    analysis.gapScore >= 35 ? 'בינוני' : 'נמוך'

  const marketGap: RevenueEngineInput['marketGapScore'] =
    analysis.gapScore >= 75 ? 'חריג' :
    analysis.gapScore >= 55 ? 'משמעותי' :
    analysis.gapScore >= 35 ? 'בינוני' : 'קטן'

  const urgency: RevenueEngineInput['urgencySignalScore'] =
    analysis.marketMomentum === 'עולה'   ? 'דחיפות ברורה' :
    analysis.marketMomentum === 'בירידה' ? 'בלי דחיפות' : 'חלון הזדמנות חלש'

  const leadMid = parseLeadRangeMidpoint(analysis.leadPotential)

  return {
    trendGrowthRate:          trendGrowth,
    searchVolumeScore:        analysis.demandScore,
    geoSpreadScore:           regionToCount(analysis.region),
    signalVelocityScore:      signals.length,
    eventTenderPresenceScore: tenderSignals + conferenceSignals,

    competitorCountScore:     competitorSignals * 2,
    reviewQualityScore:       3.5,
    brandStrengthScore:       brandStrength,

    directLeadCountScore:  leadMid,
    tenderCountScore:      tenderSignals,
    eventNetworkingScore:  conferenceSignals,

    leadQualityScore:   leadQuality,
    marketGapScore:     marketGap,
    urgencySignalScore: urgency,

    signalCount: signals.length,
  }
}

// ── Weekly Action adapter ─────────────────────────────────────────────────────

export function revenueInputFromWeeklyAction(action: WeeklyAction): RevenueEngineInput {
  const tenderSignals     = action.signals.filter(s => s.type === 'tender').length
  const conferenceSignals = action.signals.filter(s => s.type === 'conference').length
  const competitorSignals = action.signals.filter(s => s.type === 'competitor').length
  const leadSignals       = action.signals.filter(s => s.type === 'lead').length
  const trendSignals      = action.signals.filter(s => s.type === 'trend').length

  const hasTrendSignal = trendSignals > 0

  const searchVolume =
    action.priority === 'גבוהה'   ? 70 :
    action.priority === 'בינונית' ? 45 : 25

  const leadQuality: RevenueEngineInput['leadQualityScore'] =
    action.priority === 'גבוהה'   ? 'חזק' :
    action.priority === 'בינונית' ? 'טוב' : 'בינוני'

  const urgency: RevenueEngineInput['urgencySignalScore'] =
    action.priority === 'גבוהה'   ? 'דחיפות ברורה' :
    action.priority === 'בינונית' ? 'חלון הזדמנות חלש' : 'בלי דחיפות'

  // Time-to-revenue by category
  const timeOverrides: Record<string, { min: number; max: number }> = {
    'ליד':    { min: 7,  max: 21  },
    'מכרז':   { min: 30, max: 90  },
    'כנס':    { min: 45, max: 120 },
  }
  const timeToRevenueOverride = timeOverrides[action.category] ?? { min: 21, max: 60 }

  return {
    trendGrowthRate:          hasTrendSignal ? 'עולה' : 'יציב',
    searchVolumeScore:        searchVolume,
    geoSpreadScore:           2,
    signalVelocityScore:      action.signals.length,
    eventTenderPresenceScore: tenderSignals + conferenceSignals,

    competitorCountScore:     competitorSignals * 2,
    reviewQualityScore:       3.5,
    brandStrengthScore:       'בינוני',

    directLeadCountScore:  leadSignals * 4,
    tenderCountScore:      tenderSignals,
    eventNetworkingScore:  conferenceSignals,

    leadQualityScore:   leadQuality,
    marketGapScore:     'בינוני',
    urgencySignalScore: urgency,

    signalCount:            action.signals.length,
    timeToRevenueOverride,
  }
}
