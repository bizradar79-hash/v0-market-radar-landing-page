/**
 * Deterministic Google-review insights — the review-side twin of the social
 * insights in ./summarize. ZERO AI calls: everything here is arithmetic and
 * Hebrew token counting, so it costs nothing beyond the DataForSEO fetch and
 * gives the same answer for the same data every run.
 *
 * Every insight degrades gracefully: when the data can't support it, the field
 * is omitted rather than guessed or shown as a bare blank.
 */
import { themeTokens, displayFormOf } from './summarize'
import { RECENCY_DAYS } from './summarize'
import type { GoogleReview } from '@/lib/seo/google-reviews'

/** A review at or below this is a complaint worth surfacing to the client. */
const NEGATIVE_MAX = 2
/** Below this many recent reviews we state the number but skip the averages. */
const MIN_FOR_AVERAGE = 2
/** A rating gap smaller than this is noise, not a trend. */
const SENTIMENT_EPSILON = 0.15

export interface ReviewInsights {
  /** ⭐ Current standing. */
  standing?: { rating: number | null; total: number | null; text: string }
  /** 🆕 New reviews inside the window. */
  recent?: { count: number; avgRating: number | null; text: string }
  /** 📈/📉 Recent average vs. the all-time average. */
  sentiment?: { direction: 'up' | 'down' | 'flat'; delta: number; text: string }
  /** 🗣 What customers keep mentioning. */
  themes?: { terms: Array<{ term: string; count: number }>; text: string }
  /** ⚠️ Recent low-star reviews, surfaced verbatim (an opening for the client). */
  negatives?: Array<{ date: string; rating: number | null; text: string }>
  noRecentReviews?: boolean
  windowDays: number
}

export interface ReviewSnapshot {
  found: boolean
  title?: string
  address?: string
  cid?: string
  /** The Google Maps listing for the resolved business. */
  mapsUrl?: string
  /** Maps-search candidates + name scores, for diagnosing a missing match. */
  candidates?: Array<{ title: string; score: number; cid?: string; address?: string }>
  /** Which resolution paths ran and how each ended (ai-maps-url, maps(...), web-search). */
  passes?: string
  /** True when the business came from Google's top ranking, not a name match. */
  viaTopResult?: boolean
  rating: number | null
  reviewsCount: number | null
  reviews: GoogleReview[]
  insights?: ReviewInsights
  /** Captured every run so later runs can show rating / review-count growth. */
  capturedAt: string
  /** EXACT — DataForSEO's own reported cost for the calls this snapshot made. */
  costUSD: number
  error?: string
}

function parseDate(iso: string): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d
}

export function filterRecentReviews(
  reviews: GoogleReview[], now = new Date(), days = RECENCY_DAYS,
): GoogleReview[] {
  const cutoff = now.getTime() - days * 86400000
  return reviews.filter((r) => {
    const d = parseDate(r.date)
    return d ? d.getTime() >= cutoff : false // undated → excluded, never assumed recent
  })
}

const avg = (nums: number[]): number | null =>
  nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : null

export function computeReviewInsights(
  snapshot: { rating: number | null; reviewsCount: number | null; reviews: GoogleReview[] },
  now = new Date(),
  days = RECENCY_DAYS,
): ReviewInsights {
  const out: ReviewInsights = { windowDays: days }
  const { rating, reviewsCount, reviews } = snapshot

  // ⭐ STANDING — the only insight that needs no recent activity at all.
  if (rating != null || reviewsCount != null) {
    out.standing = {
      rating, total: reviewsCount,
      text: rating != null && reviewsCount != null
        ? `דירוג ${rating} מתוך 5 · ${reviewsCount.toLocaleString()} ביקורות`
        : rating != null ? `דירוג ${rating} מתוך 5` : `${(reviewsCount || 0).toLocaleString()} ביקורות`,
    }
  }

  const recent = filterRecentReviews(reviews, now, days)
  if (recent.length === 0) {
    out.noRecentReviews = true
    return out
  }

  // 🆕 NEW REVIEWS in the window.
  const recentRatings = recent.map((r) => r.rating).filter((n): n is number => typeof n === 'number')
  const recentAvg = recentRatings.length >= MIN_FOR_AVERAGE ? avg(recentRatings) : null
  out.recent = {
    count: recent.length,
    avgRating: recentAvg,
    text: recentAvg != null
      ? `${recent.length} ביקורות חדשות ב-${days} יום, ממוצע ${recentAvg}`
      : `${recent.length} ביקורות חדשות ב-${days} יום`,
  }

  // 📈/📉 SENTIMENT DIRECTION — recent average vs. their all-time rating.
  if (recentAvg != null && rating != null) {
    const delta = Math.round((recentAvg - rating) * 10) / 10
    if (Math.abs(delta) < SENTIMENT_EPSILON) {
      out.sentiment = { direction: 'flat', delta, text: `הביקורות האחרונות בקו עם הממוצע (${rating})` }
    } else if (delta > 0) {
      out.sentiment = { direction: 'up', delta, text: `הביקורות האחרונות טובות מהממוצע (${recentAvg} מול ${rating})` }
    } else {
      out.sentiment = { direction: 'down', delta, text: `הביקורות האחרונות חלשות מהממוצע (${recentAvg} מול ${rating})` }
    }
  }

  // 🗣 RECURRING THEMES — same normalization as the social themes.
  const freq = new Map<string, number>()
  for (const r of recent) {
    for (const tok of new Set(themeTokens(r.text || ''))) freq.set(tok, (freq.get(tok) || 0) + 1)
  }
  const terms = [...freq.entries()]
    .filter(([, c]) => c >= 2) // must actually recur
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    // Show the original spelling, not the normalized (sofit-folded) one.
    .map(([term, count]) => ({ term: displayFormOf(term, recent.map((r) => r.text || '')), count }))
  if (terms.length > 0 && recent.filter((r) => (r.text || '').trim()).length >= 3) {
    out.themes = { terms, text: `לקוחות מזכירים: ${terms.map((t) => `"${t.term}" (${t.count})`).join(' · ')}` }
  }

  // ⚠️ NEGATIVE REVIEWS — verbatim, newest first. An opening for the client.
  const negatives = recent
    .filter((r) => typeof r.rating === 'number' && r.rating <= NEGATIVE_MAX)
    .sort((a, b) => (parseDate(b.date)?.getTime() || 0) - (parseDate(a.date)?.getTime() || 0))
    .slice(0, 3)
    .map((r) => ({
      date: parseDate(r.date)?.toLocaleDateString('he-IL') || '',
      rating: r.rating,
      text: (r.text || '').slice(0, 300),
    }))
  if (negatives.length) out.negatives = negatives

  return out
}
