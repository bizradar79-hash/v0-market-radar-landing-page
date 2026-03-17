"use client"

import Link from "next/link"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CheckCircle2, ExternalLink, ArrowLeft, Bookmark, BookmarkCheck } from "lucide-react"
import type { NicheOpportunity, NicheStatus, NicheSignal } from "@/types/niche-opportunity"

const demandColor: Record<string, string> = {
  עולה: "bg-green-100 text-green-700 border-green-200",
  יציב: "bg-gray-100 text-gray-600 border-gray-200",
  יורד: "bg-red-100 text-red-700 border-red-200",
}

const competitionColor: Record<string, string> = {
  נמוכה: "bg-green-100 text-green-700 border-green-200",
  בינונית: "bg-yellow-100 text-yellow-700 border-yellow-200",
  גבוהה: "bg-red-100 text-red-700 border-red-200",
}

const signalIcon: Record<string, string> = {
  trend:      "📈",
  competitor: "🏢",
  tender:     "📋",
  news:       "📰",
  lead:       "👤",
  conference: "🎤",
}

const signalBorder: Record<string, string> = {
  trend:      "border-blue-300",
  competitor: "border-red-300",
  tender:     "border-purple-300",
  news:       "border-slate-300",
  lead:       "border-teal-300",
  conference: "border-indigo-300",
}

interface Props {
  niche: NicheOpportunity | null
  open: boolean
  status: NicheStatus
  onClose: () => void
  onStatusChange: (nicheId: string, newStatus: NicheStatus) => void
}

export default function NicheDetailsPanel({ niche, open, status, onClose, onStatusChange }: Props) {
  if (!niche) return null

  const isTracking = status === 'tracking'
  const demandArrow = niche.demandTrend === 'עולה' ? '↑' : niche.demandTrend === 'יורד' ? '↓' : '→'

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto" dir="rtl">
        <SheetHeader className="mb-6">
          <div className="flex flex-wrap gap-2 mb-3">
            <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
              {niche.category}
            </Badge>
            {niche.region && (
              <Badge variant="outline" className="text-muted-foreground">{niche.region}</Badge>
            )}
            {isTracking && (
              <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-200">במעקב ✓</Badge>
            )}
          </div>
          <SheetTitle className="text-xl font-bold text-right leading-tight">
            {niche.nicheTitle}
          </SheetTitle>
          <p className="text-sm text-muted-foreground text-right mt-2 leading-relaxed">
            {niche.shortInsightSummary}
          </p>
        </SheetHeader>

        <div className="space-y-6 text-right">
          {/* Scores side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground mb-2">ציון הזדמנות</p>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-2xl font-bold text-blue-600">{niche.opportunityScore}</span>
              </div>
              <div className="h-2 rounded-full bg-blue-100 overflow-hidden">
                <div className="h-full rounded-full bg-blue-500" style={{ width: `${niche.opportunityScore}%` }} />
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground mb-2">ביטחון בניתוח</p>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-2xl font-bold text-indigo-600">{niche.confidenceScore}</span>
              </div>
              <div className="h-2 rounded-full bg-indigo-100 overflow-hidden">
                <div className="h-full rounded-full bg-indigo-500" style={{ width: `${niche.confidenceScore}%` }} />
              </div>
            </div>
          </div>

          {/* Demand + Competition */}
          <div className="flex gap-2 flex-wrap">
            <Badge variant="outline" className={demandColor[niche.demandTrend] || ""}>
              {demandArrow} ביקוש {niche.demandTrend}
            </Badge>
            <Badge variant="outline" className={competitionColor[niche.competitionLevel] || ""}>
              תחרות {niche.competitionLevel}
            </Badge>
          </div>

          {/* Why fits your business */}
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
            <p className="text-xs font-semibold text-blue-700 mb-2">למה זה מתאים לעסק שלך?</p>
            <p className="text-sm text-blue-800 leading-relaxed">{niche.whyThisNicheFitsYourBusiness}</p>
          </div>

          {/* Signals */}
          {niche.signals && niche.signals.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3">סיגנלים שזוהו ({niche.signals.length})</h3>
              <div className="space-y-2">
                {niche.signals.map((signal, i) => (
                  <SignalCard key={signal.id || i} signal={signal} />
                ))}
              </div>
            </div>
          )}

          {/* Market potential */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/30 border p-3">
              <p className="text-xs text-muted-foreground mb-1">פוטנציאל לידים</p>
              <p className="text-sm font-semibold">{niche.estimatedLeadPotential || '—'}</p>
            </div>
            <div className="rounded-lg bg-muted/30 border p-3">
              <p className="text-xs text-muted-foreground mb-1">גודל שוק משוער</p>
              <p className="text-sm font-semibold">{niche.estimatedMarketSize || '—'}</p>
            </div>
          </div>

          {/* Related keywords */}
          {niche.relatedKeywords && niche.relatedKeywords.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">מילות מפתח קשורות</h3>
              <div className="flex flex-wrap gap-1.5">
                {niche.relatedKeywords.map((kw, i) => (
                  <Badge key={i} variant="outline" className="text-xs">{kw}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Related competitors */}
          {niche.relatedCompetitors && niche.relatedCompetitors.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">מתחרים קשורים</h3>
              <div className="flex flex-wrap gap-1.5">
                {niche.relatedCompetitors.map((c, i) => (
                  <Badge key={i} variant="outline" className="text-xs bg-red-50 text-red-600 border-red-200">{c}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Strategic steps */}
          {niche.strategicNextSteps && niche.strategicNextSteps.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3">צעדים אסטרטגיים</h3>
              <ol className="space-y-2">
                {niche.strategicNextSteps.map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 mt-0.5">
                      {i + 1}
                    </div>
                    <span className="text-sm">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Bottom CTA */}
          <div className="pt-2 border-t">
            <Button
              variant={isTracking ? "outline" : "default"}
              className={`w-full ${isTracking ? "border-blue-300 text-blue-600 hover:bg-blue-50" : "bg-blue-600 hover:bg-blue-700"}`}
              onClick={() => onStatusChange(niche.id, isTracking ? 'new' : 'tracking')}
            >
              {isTracking ? (
                <><BookmarkCheck className="h-4 w-4 ml-2" />הסר מעקב</>
              ) : (
                <><Bookmark className="h-4 w-4 ml-2" />התחל מעקב</>
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function SignalCard({ signal }: { signal: NicheSignal }) {
  const icon = signalIcon[signal.type] || "📌"
  const border = signalBorder[signal.type] || "border-gray-300"

  return (
    <div className={`rounded-lg border-r-4 border border-border bg-muted/30 p-3 ${border}`}>
      <div className="flex items-start gap-2">
        <span className="text-base shrink-0 mt-0.5">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold leading-tight">{signal.title}</p>
            <span className="text-xs text-muted-foreground shrink-0">{signal.relevanceScore}%</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{signal.source} · {signal.date}</p>
          <div className="flex flex-wrap gap-3 mt-2">
            {signal.sourceRoute && (
              <Link href={signal.sourceRoute} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                צפה במערכת
                <ArrowLeft className="h-3 w-3" />
              </Link>
            )}
            {signal.externalUrl && (
              <a
                href={signal.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                מקור חיצוני
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
