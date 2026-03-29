"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Loader2,
  RefreshCw,
  Search,
  Bot,
  CheckCircle2,
  XCircle,
  Lightbulb,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

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

  const [showAllSeo, setShowAllSeo] = useState(false)
  const [expandedSeoRow, setExpandedSeoRow] = useState<number | null>(null)

  const [seoFilter, setSeoFilter] = useState<SeoFilter>('all')
  const [selectedGeoEngine, setSelectedGeoEngine] = useState<'general' | 'chatgpt' | 'gemini' | 'grok'>('general')

  const supabase = createClient()
  const { toast } = useToast()

  useEffect(() => {
    fetchRankings()
  }, [])

  async function fetchRankings() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('companies').select('seo_ranking, geo_ranking').eq('id', user.id).single()
    if (data?.seo_ranking?.fetchedAt) setSeoRanking(data.seo_ranking as SEORanking)
    if (data?.geo_ranking?.fetchedAt) setGeoRanking(data.geo_ranking as GEORanking)
  }

  async function refreshSeo() {
    setLoadingSeo(true)
    try {
      const res = await fetch('/api/generate-seo-ranking?force=true', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setSeoRanking(data as SEORanking)
        toast({ title: "דירוג SEO עודכן" })
      } else {
        toast({ title: "שגיאה בטעינת SEO", description: data.error, variant: "destructive" })
      }
    } catch {
      toast({ title: "שגיאה", variant: "destructive" })
    } finally {
      setLoadingSeo(false)
    }
  }

  async function refreshGeo() {
    setLoadingGeo(true)
    try {
      const res = await fetch('/api/generate-geo-ranking?force=true', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setGeoRanking(data as GEORanking)
        toast({ title: "דירוג GEO עודכן" })
      } else {
        toast({ title: "שגיאה בטעינת GEO", description: data.error, variant: "destructive" })
      }
    } catch {
      toast({ title: "שגיאה", variant: "destructive" })
    } finally {
      setLoadingGeo(false)
    }
  }

  function filterResults(results: QueryVariantResult[] | undefined): QueryVariantResult[] {
    if (!results) return []
    if (seoFilter === 'organic') return results.filter(r => !r.is_sponsored)
    if (seoFilter === 'sponsored') return results.filter(r => r.is_sponsored)
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

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">דירוג SEO/GEO</h1>
        <p className="text-muted-foreground">היכן העסק שלך מופיע בגוגל ובמנועי AI</p>
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
            <Button variant="outline" size="sm" onClick={refreshSeo} disabled={loadingSeo}>
              {loadingSeo ? <Loader2 className="ml-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="ml-2 h-3.5 w-3.5" />}
              רענן
            </Button>
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
                      { id: 'all', label: 'הכל' },
                      { id: 'organic', label: 'אורגני בלבד' },
                      { id: 'sponsored', label: 'ממומן בלבד' },
                    ] as const).map(f => (
                      <button
                        key={f.id}
                        onClick={() => setSeoFilter(f.id)}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                          seoFilter === f.id
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {f.label}
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
                        <col style={{ width: '50%' }} />
                        <col style={{ width: '15%' }} />
                        <col style={{ width: '15%' }} />
                        <col style={{ width: '20%' }} className="hidden md:table-column" />
                      </colgroup>
                      <thead>
                        <tr className="border-b border-border bg-muted/40">
                          <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">שאילתה</th>
                          <th className="text-center py-2 px-3 text-xs font-medium text-muted-foreground">נמצאת</th>
                          <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">מיקום</th>
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
                                className={`border-b border-border cursor-pointer hover:bg-muted/30 transition-colors ${v.appeared && v.position != null ? 'bg-green-50/50' : 'bg-red-50/30'}`}
                              >
                                <td className="py-2.5 px-3">
                                  <span className="block text-sm font-medium truncate" title={v.query}>
                                    {v.query}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  {v.appeared && v.position != null ? <span className="text-green-600">✅</span> : <span className="text-red-500">❌</span>}
                                </td>
                                <td className="py-2.5 px-3">
                                  {v.position != null
                                    ? <span className="font-bold text-green-700">#{v.position}</span>
                                    : <span className="text-muted-foreground">—</span>
                                  }
                                </td>
                                <td className="py-2.5 px-3 hidden md:table-cell text-muted-foreground truncate">
                                  {v.topResults.slice(0, 3).join(', ') || '—'}
                                </td>
                              </tr>
                              {expandedSeoRow === i && (
                                <tr key={`seo-expand-${i}`} className="bg-muted/10 border-b border-border">
                                  <td colSpan={4} className="px-3 py-3">
                                    <p className="text-xs text-muted-foreground mb-2 break-words whitespace-normal font-medium">{v.query}</p>
                                    {filteredResults.length > 0 ? (
                                      <div className="space-y-0.5">
                                        {filteredResults.map((r, ri) => (
                                          <div key={ri} className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs ${r.isOwn ? 'bg-green-100 border border-green-200' : 'bg-background border border-transparent'}`}>
                                            <span className={`font-mono font-bold w-6 shrink-0 text-right ${r.isOwn ? 'text-green-700' : 'text-muted-foreground'}`}>#{r.position}</span>
                                            <span className={`flex-1 font-medium ${r.isOwn ? 'text-green-800' : 'text-foreground'}`}>{r.name}</span>
                                            {r.is_sponsored && <Badge className="bg-orange-100 text-orange-700 border-orange-200 shrink-0 py-0 h-4 text-[10px]">ממומן</Badge>}
                                            {r.isOwn && <Badge className="bg-green-600 text-white shrink-0 py-0 h-4 text-[10px]">אתה</Badge>}
                                            {!r.isOwn && r.isKnownCompetitor && <Badge variant="outline" className="border-orange-300 text-orange-600 shrink-0 py-0 h-4 text-[10px]">מתחרה</Badge>}
                                            {r.url && (
                                              <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary shrink-0" title={r.url}>
                                                <ExternalLink className="h-3 w-3" />
                                              </a>
                                            )}
                                          </div>
                                        ))}
                                        {!filteredResults.some(r => r.isOwn) && v.results && v.results.some(r => r.isOwn) && (
                                          <p className="text-xs text-amber-600 mt-1.5">העסק שלך מופיע בסינון אחר</p>
                                        )}
                                        {!filteredResults.some(r => r.isOwn) && !v.results?.some(r => r.isOwn) && (
                                          <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1"><XCircle className="h-3 w-3" />לא נמצאת בטופ 10</p>
                                        )}
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
                                          <p className="text-xs text-green-600 mt-1.5 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />נמצאת במיקום #{v.position}</p>
                                        ) : (
                                          <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1"><XCircle className="h-3 w-3" />לא נמצאת בטופ 10</p>
                                        )}
                                      </div>
                                    ) : (
                                      <p className="text-xs text-muted-foreground">רענן לצפייה בתוצאות מלאות</p>
                                    )}
                                  </td>
                                </tr>
                              )}
                            </>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {seoRanking.queryVariants.length > 6 && (
                    <button onClick={() => setShowAllSeo(v => !v)} className="text-sm text-primary flex items-center gap-1 hover:underline">
                      {showAllSeo ? <><ChevronUp className="h-3.5 w-3.5" />הצג פחות</> : <><ChevronDown className="h-3.5 w-3.5" />הצג הכל ({seoRanking.queryVariants.length})</>}
                    </button>
                  )}
                </>
              ) : (
                /* Fallback: original single-query display */
                <div className="space-y-2">
                  {seoRanking.results.map((r, i) => (
                    <div key={i} className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${r.isOwn ? 'border-primary/30 bg-primary/5' : 'border-border'}`}>
                      <span className={`font-bold w-6 text-center ${r.isOwn ? 'text-primary' : 'text-muted-foreground'}`}>#{r.position}</span>
                      <span className={`flex-1 font-medium ${r.isOwn ? 'text-primary' : ''}`}>{r.name}</span>
                      {r.is_sponsored && <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs">ממומן</Badge>}
                      {r.isOwn && <Badge variant="outline" className="text-xs border-primary/40 text-primary">העסק שלי</Badge>}
                    </div>
                  ))}
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
              לחץ "רענן" כדי לבדוק היכן העסק שלך מופיע בתוצאות גוגל לעומת המתחרים
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
            <Button variant="outline" size="sm" onClick={refreshGeo} disabled={loadingGeo}>
              {loadingGeo ? <Loader2 className="ml-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="ml-2 h-3.5 w-3.5" />}
              רענן
            </Button>
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
              {geoRanking.what_business_does && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Bot className="h-3 w-3 shrink-0" />AI הבין: {geoRanking.what_business_does}</p>
              )}
              {geoRanking.engines ? (
                <>
                  {/* Engine tabs — 4 engines, no Perplexity */}
                  <div className="flex gap-0 border-b border-border overflow-x-auto">
                    {([
                      { id: 'general', label: 'כללי' },
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

                  {/* Selected engine results */}
                  {(() => {
                    const eng = geoRanking.engines![selectedGeoEngine]
                    if (!eng) return <p className="text-sm text-muted-foreground py-4 text-center">אין נתונים למנוע זה — לחץ רענן</p>
                    return (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          {eng.appeared && eng.position != null
                            ? <Badge className="bg-green-100 text-green-700 border-green-200"><CheckCircle2 className="h-3 w-3 ml-1" />נמצאת במיקום #{eng.position}</Badge>
                            : <Badge variant="outline" className="text-muted-foreground"><XCircle className="h-3 w-3 ml-1" />לא נמצאת בטופ 10</Badge>
                          }
                        </div>
                        <div className="space-y-0.5">
                          {eng.results.length > 0 ? eng.results.map((r, ri) => (
                            <div key={ri} className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs ${r.isOwn ? 'bg-green-100 border border-green-200' : 'bg-background border border-transparent'}`}>
                              <span className={`font-mono font-bold w-6 shrink-0 text-right ${r.isOwn ? 'text-green-700' : 'text-muted-foreground'}`}>#{r.position}</span>
                              <span className={`flex-1 font-medium ${r.isOwn ? 'text-green-800' : 'text-foreground'}`}>{r.name}</span>
                              {r.isOwn && <Badge className="bg-green-600 text-white shrink-0 py-0 h-4 text-[10px]">אתה</Badge>}
                              {!r.isOwn && r.isKnownCompetitor && <Badge variant="outline" className="border-orange-300 text-orange-600 shrink-0 py-0 h-4 text-[10px]">מתחרה</Badge>}
                            </div>
                          )) : (
                            <p className="text-xs text-muted-foreground">רענן לצפייה בתוצאות</p>
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
                  {geoRanking.results.map((r, i) => (
                    <div key={i} className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 ${r.isOwn ? "border-primary/30 bg-primary/5" : "border-border"}`}>
                      <span className={`font-bold w-6 text-center ${r.isOwn ? "text-primary" : "text-muted-foreground"}`}>#{r.position}</span>
                      <span className={`flex-1 text-sm font-medium ${r.isOwn ? "text-primary" : ""}`}>{r.name}</span>
                      {r.isOwn && <Badge variant="outline" className="text-xs border-primary/40 text-primary">העסק שלי</Badge>}
                      {!r.isOwn && r.isKnownCompetitor && <Badge variant="outline" className="text-xs border-orange-300 text-orange-600">מתחרה</Badge>}
                    </div>
                  ))}
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
              לחץ "רענן" כדי לבדוק האם העסק שלך מוזכר כשמנועי AI נשאלים על תחומך
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
