"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Loader2,
  Search,
  Bot,
  CheckCircle2,
  XCircle,
  Lightbulb,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Trophy,
  Target,
} from "lucide-react"

interface RankingResult {
  position: number
  name: string
  url?: string
  title?: string
  isOwn?: boolean
  isKnownCompetitor?: boolean
  is_sponsored?: boolean
}

interface QueryVariantResult {
  position: number
  name: string
  url?: string
  title?: string
  isOwn?: boolean
  isKnownCompetitor?: boolean
  is_sponsored?: boolean
}

interface QueryVariant {
  query: string
  position: number | null
  topResults: string[]
  appeared: boolean
  results?: QueryVariantResult[]
  // Client's OWN row, preserved by the server even when it's past the top-10 or
  // would be deduped — the single source of truth for "your position".
  ownResult?: { position: number | null; name?: string; url?: string; isOwn?: boolean } | null
  status?: 'found' | 'not_found' | 'error'
  // Business context attached on scan (batched DataForSEO Google Ads volume).
  searchVolume?: number | null
  competition?: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN' | null
  competitionHe?: string | null
  cpc?: number | null
}

interface SEORanking {
  query: string
  results: RankingResult[]
  queryVariants?: QueryVariant[]
  recommendations: string[]
  isLocal?: boolean
  scope?: string
  what_business_does?: string
  fetchedAt: string
}

interface EngineResults {
  results: RankingResult[]
  appeared: boolean
  position: number | null
  topResults: string[]
}

interface GEORanking {
  query: string
  queries?: string[]
  queryResults?: Record<string, {
    chatgpt: EngineResults
    gemini: EngineResults
    grok: EngineResults
  }>
  results: RankingResult[]
  queryVariants?: QueryVariant[]
  engines?: {
    general?: EngineResults
    chatgpt?: EngineResults
    gemini?: EngineResults
    grok?: EngineResults
  }
  userMentioned: boolean
  userPosition: number | null
  recommendations: string[]
  isLocal?: boolean
  scope?: string
  what_business_does?: string
  fetchedAt: string
}

type SeoFilter = 'all' | 'organic' | 'sponsored'

export default function SeoGeoPage() {
  const [seoRanking, setSeoRanking] = useState<SEORanking | null>(null)
  const [geoRanking, setGeoRanking] = useState<GEORanking | null>(null)
  const [loadingSeo, setLoadingSeo] = useState(false)
  const [loadingGeo, setLoadingGeo] = useState(false)
  const [company, setCompany] = useState<{ name: string; website: string } | null>(null)

  const [syncDates, setSyncDates] = useState<{ last_sync_at: string | null; next_sync_at: string | null } | null>(null)
  const [showAllSeo, setShowAllSeo] = useState(false)
  const [expandedSeoRow, setExpandedSeoRow] = useState<number | null>(null)

  const [seoFilter, setSeoFilter] = useState<SeoFilter>('all')
  const [selectedGeoEngine, setSelectedGeoEngine] = useState<'chatgpt' | 'gemini' | 'grok'>('chatgpt')
  const [selectedGeoQuery, setSelectedGeoQuery] = useState<string>('')

  const supabase = createClient()

  useEffect(() => {
    fetchRankings()
  }, [])

  async function fetchRankings() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('companies').select('name, website, seo_ranking, geo_ranking, last_sync_at, next_sync_at').eq('id', user.id).single()
    if (data?.seo_ranking?.fetchedAt) setSeoRanking(data.seo_ranking as SEORanking)
    if (data?.geo_ranking?.fetchedAt) setGeoRanking(data.geo_ranking as GEORanking)
    if (data) setSyncDates({ last_sync_at: (data as any).last_sync_at ?? null, next_sync_at: (data as any).next_sync_at ?? null })
    if (data?.name || data?.website) setCompany({ name: data.name || '', website: data.website || '' })
  }

  function isCompanyResult(r: { url?: string; name?: string; title?: string }): boolean {
    if (!company) return false
    const raw = company.website || ''
    const domain = raw.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase()
    const resultUrl = (r.url || '').toLowerCase()
    const resultTitle = (r.title || r.name || '').toLowerCase().trim()
    const companyName = company.name.toLowerCase().trim()
    if (domain && resultUrl.includes(domain)) return true
    if (companyName && resultTitle === companyName) return true
    return false
  }


  // Format monthly search volume, e.g. 12100 → "12,100/חו׳".
  function fmtVolume(v: number | null | undefined): string | null {
    if (v == null || v <= 0) return null
    return `${v.toLocaleString('he-IL')}/חו׳`
  }

  // Competition chip color by bucket.
  function competitionChipClass(c: string | null | undefined): string {
    if (c === 'LOW') return 'bg-green-100 text-green-700 border-green-200'
    if (c === 'MEDIUM') return 'bg-amber-100 text-amber-700 border-amber-200'
    if (c === 'HIGH') return 'bg-red-100 text-red-700 border-red-200'
    return 'bg-muted text-muted-foreground border-border'
  }

  function allResults(variants: QueryVariant[] | undefined): QueryVariantResult[] {
    return (variants ?? []).flatMap(v => v.results ?? [])
  }

  function filterResults(results: QueryVariantResult[] | undefined): QueryVariantResult[] {
    if (!results) return []
    if (seoFilter === 'organic') return results.filter(r => r.is_sponsored === false || r.is_sponsored === undefined)
    if (seoFilter === 'sponsored') return results.filter(r => r.is_sponsored === true)
    return results
  }

  function filterVariants(variants: QueryVariant[] | undefined): QueryVariant[] {
    if (!variants) return []
    if (seoFilter === 'all') return variants
    return variants.map(v => ({
      ...v,
      results: filterResults(v.results),
    })).filter(v => (v.results?.length ?? 0) > 0)
  }

  function getTabCount(filter: SeoFilter): number {
    if (!seoRanking?.queryVariants) return 0
    const all = allResults(seoRanking.queryVariants)
    if (filter === 'all') return all.length
    if (filter === 'organic') return all.filter(r => r.is_sponsored === false || r.is_sponsored === undefined).length
    return all.filter(r => r.is_sponsored === true).length
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">דירוג SEO/GEO</h1>
        <p className="text-muted-foreground">היכן העסק שלך מופיע בגוגל ובמנועי AI</p>
        {syncDates && (
          <p className="text-xs text-muted-foreground mt-1">
            עודכן: {syncDates.last_sync_at ? new Date(syncDates.last_sync_at).toLocaleDateString('he-IL') : '—'} | עדכון הבא: {syncDates.next_sync_at ? new Date(syncDates.next_sync_at).toLocaleDateString('he-IL') : '—'}
          </p>
        )}
      </div>

      {/* SEO Ranking */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg flex-wrap">
                <Search className="h-5 w-5 text-primary" />
                דירוג SEO
                {seoRanking?.scope && (
                  <Badge variant="outline" className={`text-xs font-normal ${seoRanking.isLocal ? 'border-blue-200 text-blue-600 bg-blue-50' : 'border-gray-300 text-gray-500'}`}>
                    {seoRanking.scope}
                  </Badge>
                )}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">היכן אני מופיע בגוגל לעומת המתחרים</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingSeo ? (
            <div className="flex items-center justify-center py-10 gap-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">בודק דירוגי SEO...</span>
            </div>
          ) : seoRanking ? (
            <div className="space-y-4">
              {seoRanking.what_business_does && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Search className="h-3 w-3 shrink-0" />AI הבין: {seoRanking.what_business_does}</p>
              )}
              {seoRanking.queryVariants && seoRanking.queryVariants.length > 0 ? (
                <>
                  {/* Filter toggle */}
                  <div className="flex gap-1 p-1 bg-muted/40 rounded-lg w-fit">
                    {([
                      { id: 'all' as SeoFilter, label: 'הכל' },
                      { id: 'organic' as SeoFilter, label: 'אורגני' },
                      { id: 'sponsored' as SeoFilter, label: 'ממומן' },
                    ]).map(f => (
                      <button
                        key={f.id}
                        onClick={() => setSeoFilter(f.id)}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                          seoFilter === f.id
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {f.label} ({getTabCount(f.id)})
                      </button>
                    ))}
                  </div>

                  {/* Summary */}
                  <div className="flex items-center gap-2">
                    {(() => {
                      const variants = filterVariants(seoRanking.queryVariants)
                      const appeared = variants.filter(v => v.appeared).length
                      const total = seoRanking.queryVariants!.length
                      return appeared > 0
                        ? <Badge className="bg-green-100 text-green-700 border-green-200"><CheckCircle2 className="h-3 w-3 ml-1" />נמצאת ב-{appeared} מתוך {total} חיפושים</Badge>
                        : <Badge variant="outline" className="text-muted-foreground"><XCircle className="h-3 w-3 ml-1" />לא נמצאת באף חיפוש ({total} נבדקו)</Badge>
                    })()}
                  </div>

                  {/* Variants table */}
                  <div className="rounded-lg border border-border overflow-hidden">
                    <table className="w-full table-fixed text-sm">
                      <colgroup>
                        <col style={{ width: '34%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '12%' }} />
                        <col style={{ width: '24%' }} />
                        <col style={{ width: '20%' }} className="hidden md:table-column" />
                      </colgroup>
                      <thead>
                        <tr className="border-b border-border bg-muted/40">
                          <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">שאילתה</th>
                          <th className="text-center py-2 px-3 text-xs font-medium text-muted-foreground">נמצאת</th>
                          <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">מיקום</th>
                          <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">נפח / תחרות</th>
                          <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground hidden md:table-cell">מתחרים מובילים</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(showAllSeo ? seoRanking.queryVariants : seoRanking.queryVariants.slice(0, 6)).map((v, i) => {
                          const filteredResults = filterResults(v.results)
                          return (
                            <>
                              <tr
                                key={`seo-row-${i}`}
                                onClick={() => setExpandedSeoRow(expandedSeoRow === i ? null : i)}
                                className={`border-b border-border cursor-pointer hover:bg-muted/30 transition-colors ${v.appeared && v.position != null ? 'bg-green-50/50' : v.status === 'error' ? 'bg-amber-50/40' : 'bg-red-50/30'}`}
                              >
                                <td className="py-2.5 px-3">
                                  <span className="block text-sm font-medium truncate" title={v.query}>
                                    {v.query}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  {v.appeared && v.position != null
                                    ? <span className="text-green-600">✅</span>
                                    : v.status === 'error'
                                      ? <span className="text-amber-600" title="הבדיקה נכשלה — לא ניתן לאמת דירוג">⚠</span>
                                      : <span className="text-red-500">❌</span>}
                                </td>
                                <td className="py-2.5 px-3">
                                  {v.position != null
                                    ? <span className="font-bold text-green-700">#{v.position}</span>
                                    : v.status === 'error'
                                      ? <span className="text-amber-600 text-xs">בדיקה נכשלה</span>
                                      : <span className="text-muted-foreground">—</span>
                                  }
                                </td>
                                <td className="py-2.5 px-3">
                                  {fmtVolume(v.searchVolume) ? (
                                    <div className="flex flex-col gap-1 items-start">
                                      <span className="text-xs font-medium text-foreground tabular-nums">{fmtVolume(v.searchVolume)}</span>
                                      {v.competitionHe && v.competition && v.competition !== 'UNKNOWN' && (
                                        <Badge variant="outline" className={`py-0 h-4 text-[10px] ${competitionChipClass(v.competition)}`}>{v.competitionHe}</Badge>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">—</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 hidden md:table-cell text-muted-foreground truncate">
                                  {v.topResults.slice(0, 3).join(', ') || '—'}
                                </td>
                              </tr>
                              {expandedSeoRow === i && (
                                <tr key={`seo-expand-${i}`} className="bg-muted/10 border-b border-border">
                                  <td colSpan={5} className="px-3 py-3">
                                    <p className="text-xs text-muted-foreground mb-2 break-words whitespace-normal font-medium">{v.query}</p>
                                    {filteredResults.length > 0 ? (
                                      <div className="space-y-0.5">
                                        {filteredResults.map((r, ri) => {
                                          // SINGLE SOURCE OF TRUTH: use the SERVER's ownership flag,
                                          // never a client-side re-scan.
                                          const own = !!r.isOwn
                                          return (
                                          <div key={ri} className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs ${own ? 'bg-green-100 border border-green-200' : 'bg-background border border-transparent'}`}>
                                            <span className={`font-mono font-bold w-6 shrink-0 text-right ${own ? 'text-green-700' : 'text-muted-foreground'}`}>#{r.position}</span>
                                            <span className={`flex-1 font-medium ${own ? 'text-green-800' : 'text-foreground'}`}>{r.name}</span>
                                            {r.is_sponsored && <Badge className="bg-orange-100 text-orange-700 border-orange-200 shrink-0 py-0 h-4 text-[10px]">ממומן</Badge>}
                                            {own && <Badge className="bg-green-600 text-white shrink-0 py-0 h-4 text-[10px]">אתה</Badge>}
                                            {!own && r.isKnownCompetitor && <Badge variant="outline" className="border-orange-300 text-orange-600 shrink-0 py-0 h-4 text-[10px]">מתחרה</Badge>}
                                            {r.url && (
                                              <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary shrink-0" title={r.url}>
                                                <ExternalLink className="h-3 w-3" />
                                              </a>
                                            )}
                                          </div>
                                        )})}
                                        {/* One coherent status line, driven purely by the server's
                                            position/appeared — no contradiction with the table. */}
                                        {(() => {
                                          const ownInList = filteredResults.some(r => r.isOwn)
                                          if (ownInList) return null // already highlighted above
                                          if (v.appeared && v.position != null) {
                                            return (
                                              <div className="mt-1.5 flex items-center gap-2 rounded px-2 py-1.5 text-xs bg-green-100 border border-green-200">
                                                <span className="font-mono font-bold w-auto shrink-0 text-green-700">#{v.position}</span>
                                                <span className="flex-1 font-medium text-green-800">{v.ownResult?.name || company?.name || 'העסק שלך'}</span>
                                                <Badge className="bg-green-600 text-white shrink-0 py-0 h-4 text-[10px]">המיקום שלך</Badge>
                                                {v.ownResult?.url && (
                                                  <a href={v.ownResult.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary shrink-0" title={v.ownResult.url}>
                                                    <ExternalLink className="h-3 w-3" />
                                                  </a>
                                                )}
                                              </div>
                                            )
                                          }
                                          return <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1"><XCircle className="h-3 w-3" />לא נמצאת ב-100 התוצאות הראשונות</p>
                                        })()}
                                      </div>
                                    ) : v.topResults && v.topResults.length > 0 ? (
                                      <div className="space-y-0.5">
                                        {v.topResults.map((name, idx) => (
                                          <div key={idx} className="flex items-center gap-2 rounded px-2 py-1.5 text-xs bg-background border border-transparent">
                                            <span className="font-mono font-bold w-6 shrink-0 text-right text-muted-foreground">#{idx + 1}</span>
                                            <span className="flex-1 font-medium text-foreground">{name}</span>
                                          </div>
                                        ))}
                                        {v.appeared && v.position != null ? (
                                          <p className="text-xs text-green-600 mt-1.5 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />המיקום שלך: #{v.position}</p>
                                        ) : (
                                          <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1"><XCircle className="h-3 w-3" />לא נמצאת ב-100 התוצאות הראשונות</p>
                                        )}
                                      </div>
                                    ) : v.status === 'error' ? (
                                      <p className="text-xs text-amber-600 flex items-center gap-1"><XCircle className="h-3 w-3" />⚠ בדיקה נכשלה — הנתונים יעודכנו בבדיקה הבאה</p>
                                    ) : (
                                      <p className="text-xs text-muted-foreground">הנתונים יתעדכנו בסנכרון השבועי</p>
                                    )}
                                  </td>
                                </tr>
                              )}
                            </>
                          )
                        })}
                        {filterVariants(seoRanking.queryVariants).length === 0 && (
                          <tr>
                            <td colSpan={5} className="text-center py-6 text-sm text-muted-foreground">
                              {seoFilter === 'sponsored'
                                ? 'לא נמצאו תוצאות ממומנות לשאילתות אלו'
                                : 'לא נמצאו תוצאות אורגניות'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {seoRanking.queryVariants.length > 6 && (
                    <button onClick={() => setShowAllSeo(v => !v)} className="text-sm text-primary flex items-center gap-1 hover:underline">
                      {showAllSeo ? <><ChevronUp className="h-3.5 w-3.5" />הצג פחות</> : <><ChevronDown className="h-3.5 w-3.5" />הצג הכל ({seoRanking.queryVariants.length})</>}
                    </button>
                  )}

                  {/* ── Insight card: ניתוח SEO והזדמנויות (template-based, NO AI) ── */}
                  {(() => {
                    const variants = seoRanking.queryVariants!
                    const vol = (v: QueryVariant) => v.searchVolume ?? 0
                    const compSuffix = (v: QueryVariant) =>
                      v.competitionHe && v.competition && v.competition !== 'UNKNOWN' ? `, תחרות ${v.competitionHe}` : ''
                    const tops = (v: QueryVariant) => {
                      const fromResults = (v.results || []).filter(r => !r.isOwn).map(r => r.name).filter(Boolean)
                      const list = (fromResults.length ? fromResults : v.topResults || []).slice(0, 3)
                      return list.join(', ')
                    }

                    // WINS: top-3 positions, ranked by volume (highest-value first).
                    const wins = variants
                      .filter(v => v.appeared && v.position != null && v.position <= 3)
                      .sort((a, b) => vol(b) - vol(a))
                      .slice(0, 3)

                    // OPPORTUNITIES: not in top-10 OR ranked beyond #5, ranked by
                    // volume × gap (room to climb). Prefer queries with real volume.
                    const gap = (v: QueryVariant) => (v.appeared && v.position != null ? Math.min(v.position, 20) : 20)
                    const oppPool = variants.filter(v => v.status !== 'error' && (!v.appeared || (v.position != null && v.position > 5)))
                    const opps = oppPool
                      .map(v => ({ v, score: (vol(v) || 1) * gap(v) }))
                      .sort((a, b) => b.score - a.score)
                      .slice(0, 3)
                      .map(x => x.v)

                    if (wins.length === 0 && opps.length === 0) return null

                    const winLine = (v: QueryVariant) => {
                      const fv = fmtVolume(v.searchVolume)
                      return fv
                        ? `אתה במקום #${v.position} על "${v.query}" (${v.searchVolume!.toLocaleString('he-IL')} חיפושים/חודש) — מיקום מצוין`
                        : `אתה במקום #${v.position} על "${v.query}" — מיקום מצוין`
                    }
                    const oppLine = (v: QueryVariant) => {
                      const where = v.appeared && v.position != null ? `אתה במקום #${v.position}` : 'אינך מופיע בטופ'
                      const volPart = fmtVolume(v.searchVolume)
                        ? ` (${v.searchVolume!.toLocaleString('he-IL')} חיפושים/חודש${compSuffix(v)})`
                        : ''
                      const topPart = tops(v) ? ` בטופ: ${tops(v)}.` : ''
                      return `${where} על "${v.query}"${volPart}.${topPart} שווה להשקיע כאן.`
                    }

                    return (
                      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                        <h4 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                          <Lightbulb className="h-4 w-4 text-primary" />ניתוח SEO והזדמנויות
                        </h4>
                        {wins.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-xs font-medium text-green-700 flex items-center gap-1.5"><Trophy className="h-3.5 w-3.5" />חוזקות</p>
                            <ul className="space-y-1">
                              {wins.map((v, i) => (
                                <li key={`win-${i}`} className="text-sm flex items-start gap-2 text-foreground">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600 mt-0.5 shrink-0" />
                                  <span>{winLine(v)}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {opps.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-xs font-medium text-amber-700 flex items-center gap-1.5"><Target className="h-3.5 w-3.5" />הזדמנויות</p>
                            <ul className="space-y-1">
                              {opps.map((v, i) => (
                                <li key={`opp-${i}`} className="text-sm flex items-start gap-2 text-foreground">
                                  <Target className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                                  <span>{oppLine(v)}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </>
              ) : (
                /* Fallback: original single-query display */
                <div className="space-y-2">
                  {seoRanking.results.map((r, i) => {
                    const own = isCompanyResult(r)
                    return (
                    <div key={i} className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${own ? 'border-primary/30 bg-primary/5' : 'border-border'}`}>
                      <span className={`font-bold w-6 text-center ${own ? 'text-primary' : 'text-muted-foreground'}`}>#{r.position}</span>
                      <span className={`flex-1 font-medium ${own ? 'text-primary' : ''}`}>{r.name}</span>
                      {r.is_sponsored && <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs">ממומן</Badge>}
                      {own && <Badge variant="outline" className="text-xs border-primary/40 text-primary">העסק שלי</Badge>}
                    </div>
                  )})}
                </div>
              )}
              {seoRanking.recommendations.length > 0 && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-2 text-primary"><Lightbulb className="h-3.5 w-3.5" />המלצות לשיפור SEO</h4>
                  <ul className="space-y-1.5">
                    {seoRanking.recommendations.map((rec, i) => (
                      <li key={i} className="text-sm flex items-start gap-2"><span className="font-bold text-primary shrink-0">{i + 1}.</span>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-xs text-muted-foreground">עודכן: {new Date(seoRanking.fetchedAt).toLocaleDateString('he-IL')}</p>
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              הנתונים יתעדכנו אוטומטית בסנכרון השבועי
            </div>
          )}
        </CardContent>
      </Card>

      {/* GEO Ranking */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg flex-wrap">
                <Bot className="h-5 w-5 text-primary" />
                דירוג GEO
                {geoRanking?.scope && (
                  <Badge variant="outline" className={`text-xs font-normal ${geoRanking.isLocal ? 'border-blue-200 text-blue-600 bg-blue-50' : 'border-gray-300 text-gray-500'}`}>
                    {geoRanking.scope}
                  </Badge>
                )}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">היכן אני מופיע במנועי AI לעומת המתחרים</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingGeo ? (
            <div className="flex items-center justify-center py-10 gap-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">שואל מנוע AI...</span>
            </div>
          ) : geoRanking ? (
            <div className="space-y-4">
              {(() => {
                // Compute active query and engines (supports both old and new data formats)
                const activeQuery = selectedGeoQuery || geoRanking.queries?.[0] || geoRanking.query || ''
                const activeEngines = (activeQuery && geoRanking.queryResults?.[activeQuery])
                  ? geoRanking.queryResults[activeQuery]
                  : geoRanking.engines
                return (
                  <>
                    {/* Query selector — only shown when multi-query data is available */}
                    {(geoRanking.queries?.length ?? 0) > 1 ? (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">שאילתה:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {geoRanking.queries!.map(q => (
                            <button
                              key={q}
                              onClick={() => setSelectedGeoQuery(q)}
                              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                                activeQuery === q
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'border-border text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              {q}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : geoRanking.query ? (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Search className="h-3 w-3 shrink-0" />שאילתה: {geoRanking.query}
                      </p>
                    ) : null}
                  </>
                )
              })()}
              {geoRanking.engines || geoRanking.queryResults ? (
                <>
                  {/* Engine tabs */}
                  <div className="flex gap-0 border-b border-border overflow-x-auto">
                    {([
                      { id: 'chatgpt', label: 'ChatGPT' },
                      { id: 'gemini', label: 'Gemini' },
                      { id: 'grok', label: 'Grok' },
                    ] as const).map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setSelectedGeoEngine(tab.id)}
                        className={`shrink-0 px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px ${
                          selectedGeoEngine === tab.id
                            ? 'border-primary text-primary'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Engine info box */}
                  {(() => {
                    const ENGINE_INFO: Record<string, string> = {
                      chatgpt: "מה ChatGPT ממליץ — מבוסס על OpenAI",
                      gemini: "מה Gemini ממליץ — מבוסס על Google Gemini",
                      grok: "מה Grok ממליץ — מבוסס על חיפוש Grok",
                    }
                    return ENGINE_INFO[selectedGeoEngine] ? (
                      <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 border">
                        📡 {ENGINE_INFO[selectedGeoEngine]}
                      </p>
                    ) : null
                  })()}

                  {/* Selected engine results */}
                  {(() => {
                    const activeQuery = selectedGeoQuery || geoRanking.queries?.[0] || geoRanking.query || ''
                    const activeEngines = (activeQuery && geoRanking.queryResults?.[activeQuery])
                      ? geoRanking.queryResults[activeQuery]
                      : geoRanking.engines
                    const eng = activeEngines?.[selectedGeoEngine]
                    if (!eng) return <p className="text-sm text-muted-foreground py-4 text-center">אין נתונים למנוע זה</p>
                    const hasResults = Array.isArray(eng.results) && eng.results.length > 0
                    return (
                      <div className="space-y-2">
                        {/* Status: client position if appeared, else a clear "not appearing" note ABOVE the list */}
                        <div className="flex items-center gap-2">
                          {eng.appeared && eng.position != null
                            ? <Badge className="bg-green-100 text-green-700 border-green-200"><CheckCircle2 className="h-3 w-3 ml-1" />העסק שלך מופיע במיקום #{eng.position}</Badge>
                            : <Badge variant="outline" className="text-muted-foreground"><XCircle className="h-3 w-3 ml-1" />העסק לא מופיע בתוצאות</Badge>
                          }
                        </div>
                        {/* ALWAYS show the engine's top-10 list, even when the client is absent. */}
                        <div className="space-y-0.5">
                          {hasResults ? eng.results.map((r, ri) => {
                            const own = isCompanyResult(r)
                            return (
                              <div key={ri} className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs ${own ? 'bg-green-100 border border-green-200' : 'bg-background border border-transparent'}`}>
                                <span className={`font-mono font-bold w-6 shrink-0 text-right ${own ? 'text-green-700' : 'text-muted-foreground'}`}>#{r.position}</span>
                                <span className={`flex-1 font-medium ${own ? 'text-green-800' : 'text-foreground'}`}>{r.name}</span>
                                {own && <Badge className="bg-green-600 text-white shrink-0 py-0 h-4 text-[10px]">אתה</Badge>}
                                {!own && r.isKnownCompetitor && <Badge variant="outline" className="border-orange-300 text-orange-600 shrink-0 py-0 h-4 text-[10px]">מתחרה</Badge>}
                              </div>
                            )
                          }) : (
                            <p className="text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1.5 border">המנוע לא החזיר תוצאות לשאילתה זו</p>
                          )}
                        </div>
                      </div>
                    )
                  })()}
                </>
              ) : (
                /* Fallback: single list */
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {geoRanking.userMentioned && geoRanking.userPosition != null
                      ? <Badge className="bg-green-100 text-green-700 border-green-200"><CheckCircle2 className="h-3 w-3 ml-1" />העסק שלי מוזכר במיקום #{geoRanking.userPosition}</Badge>
                      : <Badge variant="outline" className="text-muted-foreground"><XCircle className="h-3 w-3 ml-1" />העסק שלי לא מוזכר</Badge>
                    }
                  </div>
                  {geoRanking.results.map((r, i) => {
                    const own = isCompanyResult(r)
                    return (
                    <div key={i} className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 ${own ? "border-primary/30 bg-primary/5" : "border-border"}`}>
                      <span className={`font-bold w-6 text-center ${own ? "text-primary" : "text-muted-foreground"}`}>#{r.position}</span>
                      <span className={`flex-1 text-sm font-medium ${own ? "text-primary" : ""}`}>{r.name}</span>
                      {own && <Badge variant="outline" className="text-xs border-primary/40 text-primary">העסק שלי</Badge>}
                      {!own && r.isKnownCompetitor && <Badge variant="outline" className="text-xs border-orange-300 text-orange-600">מתחרה</Badge>}
                    </div>
                  )})}
                </div>
              )}
              {geoRanking.recommendations.length > 0 && (
                <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-2 text-blue-700"><Lightbulb className="h-3.5 w-3.5" />המלצות לשיפור נוכחות AI</h4>
                  <ul className="space-y-1.5">
                    {geoRanking.recommendations.map((rec, i) => (
                      <li key={i} className="text-sm flex items-start gap-2 text-blue-800"><span className="font-bold shrink-0">{i + 1}.</span>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-xs text-muted-foreground">עודכן: {new Date(geoRanking.fetchedAt).toLocaleDateString('he-IL')}</p>
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              הנתונים יתעדכנו אוטומטית בסנכרון השבועי
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
