"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import {
  PLATFORM_LABELS, platformStyle, recentPostsFrom, notablePostsFrom,
  engagementLabel, googleListingUrl, POSTS_WINDOW_DAYS, type DisplayPost,
} from "@/lib/competitor-intel/display"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Target, Star, TrendingUp, TrendingDown, Minus, MessageSquare,
  Flame, Users, Hash, CalendarDays, ExternalLink, AlertTriangle, Settings,
} from "lucide-react"

// Display logic is SHARED with the weekly report (lib/competitor-intel/display)
// so the module page and the report can never drift apart.
const SOURCE_LABELS = PLATFORM_LABELS

interface DerivedInsights {
  cadence?: { total: number; level: string; text: string }
  themes?: { terms: Array<{ term: string; count: number }>; text: string }
  topPosts?: Array<{ caption: string; source: string; date: string; engagement: number; text: string }>
  presence?: { source: string; count: number; text: string }
  followers?: Array<{ source: string; followers: number }>
  noRecentActivity?: boolean
  windowDays?: number
}
interface ReviewInsights {
  standing?: { rating: number | null; total: number | null; text: string }
  recent?: { count: number; avgRating: number | null; text: string }
  sentiment?: { direction: 'up' | 'down' | 'flat'; delta: number; text: string }
  themes?: { terms: Array<{ term: string; count: number }>; text: string }
  negatives?: Array<{ date: string; rating: number | null; text: string }>
  noRecentReviews?: boolean
  windowDays: number
}
interface ReviewsBlock {
  found: boolean; title?: string; address?: string; mapsUrl?: string
  rating: number | null; reviewsCount: number | null
  insights?: ReviewInsights; error?: string
}
interface SocialPost {
  caption?: string; date?: string
  likes?: number | null; comments?: number | null; views?: number | null
  postUrl?: string
}
interface SourceRow { source: string; status: string; posts?: SocialPost[] }

interface TrackedCompetitor {
  id: string
  competitor_name: string
  resolved_links: Record<string, string>
  sources: SourceRow[] | null
  insights: DerivedInsights | null
  reviews: ReviewsBlock | null
  scanned_at: string
}

/**
 * One post. The PLATFORM is a coloured badge rather than grey run-on text —
 * a competitor cross-posting to Instagram AND Facebook shows twice on purpose,
 * and the badge is what makes that read as two channels, not a duplicate.
 * Likes and comments stay SEPARATE and exact; the whole row links to the post.
 */
function PostRow({ p }: { p: DisplayPost }) {
  const st = platformStyle(p.platform)
  const body = (
    <>
      <span className="flex items-center gap-1.5">
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-bold"
          style={{ backgroundColor: st.bg, color: st.fg }}
        >
          {p.platformLabel}
        </span>
        <span className="text-[10px] text-muted-foreground">{p.dateLabel}</span>
        {p.url && <ExternalLink className="h-3 w-3 text-muted-foreground" />}
      </span>
      <span className="mt-1 block text-xs text-foreground">{p.caption}</span>
      {engagementLabel(p) && (
        <span className="text-[10px] font-medium text-muted-foreground">{engagementLabel(p)}</span>
      )}
    </>
  )
  return p.url ? (
    <a href={p.url} target="_blank" rel="noopener noreferrer"
       className="block rounded-md bg-background p-2 hover:bg-muted/60">{body}</a>
  ) : (
    <div className="rounded-md bg-background p-2">{body}</div>
  )
}

function Stars({ value }: { value: number }) {
  const full = Math.round(value)
  return (
    <span className="inline-flex items-center gap-0.5 align-middle">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className={`h-3.5 w-3.5 ${i <= full ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`} />
      ))}
    </span>
  )
}

export default function CompetitorTrackingPage() {
  const [rows, setRows] = useState<TrackedCompetitor[]>([])
  const [configured, setConfigured] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const [{ data: tracked }, { data: company }] = await Promise.all([
        supabase.from('competitor_tracking')
          .select('id, competitor_name, resolved_links, sources, insights, reviews, scanned_at')
          .eq('company_id', user.id)
          .order('competitor_name'),
        supabase.from('companies').select('business_profile').eq('id', user.id).single(),
      ])
      setRows((tracked as any) || [])
      const bp: any = company?.business_profile || {}
      setConfigured(Array.isArray(bp.directCompetitors) ? bp.directCompetitors : [])
      setLoading(false)
    })()
  }, [])

  if (loading) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Skeleton className="h-8 w-52" />
        {[1, 2].map(i => <Skeleton key={i} className="h-56 w-full" />)}
      </div>
    )
  }

  // No competitors configured yet — point at the one place that controls this.
  if (configured.length === 0) {
    return (
      <div className="p-4 md:p-6">
        <h1 className="text-2xl font-bold text-foreground">מעקב מתחרים</h1>
        <Card className="mt-6 border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Target className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-base font-medium text-foreground">עוד לא הגדרת מתחרים למעקב</p>
            <p className="max-w-md text-sm text-muted-foreground">
              הוסף עד 5 מתחרים ישירים בהגדרות — נאתר עבורם את הרשתות החברתיות ואת עמוד הגוגל,
              ונציג כאן מה הם מפרסמים ומה הלקוחות שלהם אומרים.
            </p>
            <Link
              href="/app/settings"
              className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
            >
              <Settings className="h-4 w-4" />הוסף מתחרים ישירים בהגדרות
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Configured but not scanned yet.
  const pending = configured.filter(n => !rows.some(r => r.competitor_name === n))

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">מעקב מתחרים</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          מה המתחרים שלך מפרסמים ומה הלקוחות שלהם כותבים — {rows[0]?.insights?.windowDays ?? 45} הימים האחרונים.
        </p>
      </div>

      {rows.map(row => {
        const ins = row.insights || {}
        const rev = row.reviews
        const links = row.resolved_links || {}
        const posts = recentPostsFrom(row.sources)
        const notable = notablePostsFrom(row.sources, ins)
        const googleUrl = googleListingUrl(links, rev)
        return (
          <Card key={row.id} className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base text-foreground">
                <Target className="h-4 w-4 text-primary" />
                {row.competitor_name}
                {rev?.found && rev.rating != null && (() => {
                  const inner = (
                    <span className="flex items-center gap-1.5 text-sm font-normal">
                      <Stars value={rev.rating!} />
                      <span className="text-muted-foreground">
                        {rev.rating}{rev.reviewsCount != null ? ` · ${rev.reviewsCount.toLocaleString()} ביקורות` : ''}
                      </span>
                    </span>
                  )
                  const url = googleListingUrl(row.resolved_links || {}, rev)
                  return url
                    ? <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline">{inner}</a>
                    : inner
                })()}
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {['website', 'instagram', 'facebook', 'linkedin'].map(k => links[k] ? (
                  <a key={k} href={links[k]} target="_blank" rel="noopener noreferrer"
                     className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                    {SOURCE_LABELS[k]}<ExternalLink className="h-3 w-3" />
                  </a>
                ) : null)}
                {rev?.mapsUrl && (
                  <a href={rev.mapsUrl} target="_blank" rel="noopener noreferrer"
                     className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                    גוגל<ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </CardHeader>

            <CardContent className="grid gap-4 md:grid-cols-2">
              {/* ── פעילות ברשתות ── */}
              <div className="space-y-2 rounded-lg border border-border bg-background/50 p-3">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <CalendarDays className="h-4 w-4 text-primary" />פעילות ברשתות
                </p>
                {ins.noRecentActivity || !ins.cadence ? (
                  <p className="text-sm text-muted-foreground">
                    לא זוהתה פעילות ב-{ins.windowDays ?? 45} הימים האחרונים.
                  </p>
                ) : (
                  <p className="text-sm text-foreground">{ins.cadence.text}</p>
                )}
                {ins.themes && (
                  <p className="flex items-start gap-1.5 text-sm text-foreground">
                    <Hash className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    {ins.themes.text}
                  </p>
                )}
                {(ins.topPosts || []).slice(0, 2).map((tp, i) => (
                  <p key={i} className="flex items-start gap-1.5 text-sm text-foreground">
                    <Flame className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-500" />
                    <span>
                      {tp.caption || '(ללא כיתוב)'}
                      <span className="text-muted-foreground"> — {tp.text}</span>
                    </span>
                  </p>
                ))}
                {!!(ins.followers || []).length && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    {ins.followers!.map(f => `${SOURCE_LABELS[f.source] || f.source} ${f.followers.toLocaleString()}`).join(' · ')}
                  </p>
                )}

                {/* PostRow is shared between the recent list and the notable
                    posts, so both carry platform + exact counts + a link. */}
                {(posts.length > 0 || notable.length > 0) && (
                  <div className="mt-1 space-y-2 border-t border-border pt-2">
                    {notable.length > 0 && (
                      <>
                        <p className="text-xs font-medium text-muted-foreground">🔥 הפוסטים שהכי עבדו להם</p>
                        {notable.map((p, i) => <PostRow key={`n${i}`} p={p} />)}
                      </>
                    )}
                    {posts.length > 0 && (
                      <>
                        <p className="text-xs font-medium text-muted-foreground">
                          פרסומים ב-{POSTS_WINDOW_DAYS} הימים האחרונים
                        </p>
                        {posts.map((p, i) => <PostRow key={`r${i}`} p={p} />)}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* ── ביקורות גוגל ── */}
              <div className="space-y-2 rounded-lg border border-border bg-background/50 p-3">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <MessageSquare className="h-4 w-4 text-primary" />ביקורות גוגל
                </p>
                {!rev?.found ? (
                  // Distinguish the failure modes — collapsing them all into
                  // "no listing" made a search problem look like a real absence.
                  <p className="text-sm text-muted-foreground">
                    {!rev
                      ? 'ביקורות גוגל לא נאספו בסריקה הזו.'
                      : rev.error && rev.error !== 'no_maps_results' && rev.error !== 'no_google_business_profile'
                          ? `לא נאספו ביקורות: ${rev.error}`
                          : 'לא נמצא עמוד גוגל למתחרה הזה.'}
                  </p>
                ) : (
                  <>
                    {/* The standing is the click target: it opens the
                        competitor's real Google listing, built from the cid we
                        resolved during tracking. */}
                    {rev.insights?.standing && (
                      googleUrl ? (
                        <a
                          href={googleUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-md bg-amber-100/70 px-2 py-1 text-sm font-semibold text-amber-900 hover:bg-amber-100"
                        >
                          {rev.insights.standing.text}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <p className="text-sm text-foreground">{rev.insights.standing.text}</p>
                      )
                    )}
                    {rev.insights?.noRecentReviews ? (
                      <p className="text-sm text-muted-foreground">
                        אין ביקורות חדשות ב-{rev.insights.windowDays ?? 45} הימים האחרונים.
                      </p>
                    ) : (
                      rev.insights?.recent && <p className="text-sm text-foreground">{rev.insights.recent.text}</p>
                    )}
                    {rev.insights?.sentiment && (
                      <p className={`flex items-center gap-1.5 text-sm ${
                        rev.insights.sentiment.direction === 'up' ? 'text-green-700'
                        : rev.insights.sentiment.direction === 'down' ? 'text-red-700' : 'text-muted-foreground'
                      }`}>
                        {rev.insights.sentiment.direction === 'up' ? <TrendingUp className="h-3.5 w-3.5" />
                          : rev.insights.sentiment.direction === 'down' ? <TrendingDown className="h-3.5 w-3.5" />
                          : <Minus className="h-3.5 w-3.5" />}
                        {rev.insights.sentiment.text}
                      </p>
                    )}
                    {rev.insights?.themes && (
                      <p className="flex items-start gap-1.5 text-sm text-foreground">
                        <Hash className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        {rev.insights.themes.text}
                      </p>
                    )}
                    {(rev.insights?.negatives || []).map((ng, i) => (
                      <p key={i} className="flex items-start gap-1.5 rounded-md bg-red-50 p-2 text-xs text-red-800">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                          {ng.rating ?? '?'}★{ng.date ? ` · ${ng.date}` : ''} — {ng.text || '(ללא טקסט)'}
                        </span>
                      </p>
                    ))}
                  </>
                )}
              </div>
            </CardContent>

            <CardContent className="pt-0">
              <p className="text-[11px] text-muted-foreground">
                עודכן: {new Date(row.scanned_at).toLocaleDateString('he-IL')}
              </p>
            </CardContent>
          </Card>
        )
      })}

      {pending.length > 0 && (
        <Card className="border-dashed">
          <CardContent className="py-5 text-center text-sm text-muted-foreground">
            ממתינים לסריקה הבאה: {pending.map(n => (
              <Badge key={n} variant="secondary" className="mx-1">{n}</Badge>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
