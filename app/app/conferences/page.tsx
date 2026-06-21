"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Calendar,
  MapPin,
  ExternalLink,
  Tag,
} from "lucide-react"

function getHostname(url: string): string | null {
  try { return new URL(url).hostname } catch { return null }
}

// Conference relevance is encoded into `description` by the API:
//   `[rel:<score>]<reason>␟<real description>`
function parseRelevance(description: string): { score: number | null; reason: string; text: string } {
  const m = (description || '').match(/^\[rel:(\d+)\]([\s\S]*?)␟([\s\S]*)$/)
  if (!m) return { score: null, reason: '', text: description || '' }
  return { score: parseInt(m[1], 10), reason: m[2].trim(), text: m[3] }
}

// Transparent match-quality band from the relevance % — mirrors the tenders page.
function getMatchBand(score: number) {
  if (score >= 70) return { label: 'התאמה גבוהה', text: 'text-green-700', chip: 'bg-green-100 text-green-700', bar: 'bg-green-500' }
  if (score >= 40) return { label: 'רלוונטי לתחום', text: 'text-yellow-700', chip: 'bg-yellow-100 text-yellow-700', bar: 'bg-yellow-500' }
  return { label: 'עסקי כללי', text: 'text-gray-500', chip: 'bg-gray-100 text-gray-500', bar: 'bg-gray-400' }
}

interface Conference {
  id: string
  company_id: string
  name: string
  date: string
  location: string
  description: string
  url: string
  category: string
  price?: string
  created_at: string
}

export default function ConferencesPage() {
  const [conferences, setConferences] = useState<Conference[]>([])
  const [loading, setLoading] = useState(true)
  const [savedTitles, setSavedTitles] = useState<Set<string>>(new Set())
  const supabase = createClient()

  useEffect(() => {
    fetchConferences()
    fetchSaved()
  }, [])

  async function fetchSaved() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('saved_items').select('title').eq('company_id', user.id).eq('item_type', 'conference')
    if (data) setSavedTitles(new Set(data.map((s: any) => s.title)))
  }

  async function fetchConferences() {
    const { data, error } = await supabase
      .from("conferences")
      .select("*")

    if (!error && data) {
      // Rank high-to-low by relevance (tiebreak nearest date) so the best
      // matches lead — exactly like the tenders page.
      const rows = [...data].sort((a: Conference, b: Conference) => {
        const sa = parseRelevance(a.description).score ?? -1
        const sb = parseRelevance(b.description).score ?? -1
        if (sb !== sa) return sb - sa
        if (!a.date && !b.date) return 0
        if (!a.date) return 1
        if (!b.date) return -1
        return a.date.localeCompare(b.date)
      })
      setConferences(rows)
    }
    setLoading(false)
  }

  async function saveConference(conference: Conference) {
    setSavedTitles(prev => new Set([...prev, conference.name]))
    try {
      await fetch('/api/saved-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_type: 'conference',
          item_id: conference.id,
          title: conference.name,
          description: conference.location ? `${conference.date} | ${conference.location}` : conference.date,
          url: conference.url || null,
          source_module: 'כנסים',
          metadata: { date: conference.date, location: conference.location, category: conference.category },
        }),
      })
      const win = window as any
      if (typeof win.refreshSidebarCounts === 'function') win.refreshSidebarCounts()
    } catch {}
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-32" />
            <Skeleton className="mt-2 h-4 w-48" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">כנסים ואירועים</h1>
        <p className="text-muted-foreground">
          {conferences.length} כנסים נמצאו · מתעדכן בסריקה השבועית
        </p>
      </div>

      {/* Empty State */}
      {conferences.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
              <Calendar className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">לא נמצאו כנסים רלוונטיים</h3>
            <p className="text-muted-foreground max-w-md mb-4">
              לחץ על הכפתור למעלה כדי למצוא כנסים רלוונטיים לתחום שלך
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {conferences.map((conference) => {
            const rel = parseRelevance(conference.description)
            const band = rel.score != null ? getMatchBand(rel.score) : null
            return (
            <Card key={conference.id} className="border-border bg-card hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg font-semibold text-foreground leading-tight">
                    {conference.name}
                  </CardTitle>
                  {band && (
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${band.chip}`}>
                      {rel.score}% · {band.label}
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {rel.text}
                </p>

                {rel.reason && (
                  <p className={`text-xs ${band ? band.text : 'text-muted-foreground'}`}>
                    ✓ {rel.reason}
                  </p>
                )}

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>{conference.date}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span>{conference.location}</span>
                  </div>
                  {conference.url && (() => {
                    const host = getHostname(conference.url)
                    if (!host) return null
                    return (
                      <div className="flex items-center gap-2">
                        <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <a
                          href={conference.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-teal-600 hover:underline truncate block max-w-xs"
                        >
                          {host}
                        </a>
                      </div>
                    )
                  })()}
                  {conference.price && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Tag className="h-4 w-4" />
                      <span>{conference.price}</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  {(() => {
                    const u = (conference.url || '').trim()
                    const hasReal = /^https?:\/\//i.test(u)
                    // Real verified URL → open it. Otherwise never open a dead/
                    // empty link — fall back to a Google search for the event name.
                    const target = hasReal
                      ? u
                      : `https://www.google.com/search?q=${encodeURIComponent(conference.name)}`
                    return (
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => window.open(target, '_blank', 'noopener,noreferrer')}
                      >
                        <ExternalLink className="ml-2 h-4 w-4" />
                        {hasReal ? 'הירשם לכנס' : 'חפש בגוגל'}
                      </Button>
                    )
                  })()}
                  {savedTitles.has(conference.name) ? (
                    <button className="flex items-center gap-1 text-xs border rounded-md px-2 py-1 bg-green-50 text-green-700 border-green-200 cursor-default">✓ נשמר</button>
                  ) : (
                    <button className="flex items-center gap-1 text-xs border rounded-md px-2 py-1 hover:bg-muted" onClick={() => saveConference(conference)}>🔖 שמור</button>
                  )}
                </div>
              </CardContent>
            </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
