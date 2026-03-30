"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Truck, CheckCircle2, Circle, Loader2, Info, Sparkles } from "lucide-react"

const CHANNEL_META: Record<string, { description: string; potential: 'גבוה' | 'בינוני' | 'נמוך' }> = {
  "אתר אינטרנט": { description: "נוכחות דיגיטלית ישירה — לקוחות מוצאים אתכם בגוגל ומבצעים פעולה", potential: "גבוה" },
  "מכירה ישירה": { description: "פגישות, שיחות ומכירה face-to-face עם לקוחות פוטנציאליים", potential: "גבוה" },
  "רשתות חברתיות": { description: "Instagram, Facebook, LinkedIn — בניית קהל ולידים אורגניים", potential: "גבוה" },
  "מפיצים": { description: "שותפי הפצה שמוכרים את המוצר שלכם ללקוחותיהם", potential: "בינוני" },
  "שותפים עסקיים": { description: "הסכמי שיתוף פעולה שמניבים הפניות הדדיות", potential: "גבוה" },
  "חנויות": { description: "נקודות מכירה פיזיות — ישירות או דרך קמעונאים", potential: "בינוני" },
  "B2B פגישות": { description: "תהליך מכירה מול לקוחות עסקיים בפגישות ומצגות", potential: "גבוה" },
  "קטלוגים": { description: "חומרי שיווק פיזיים/דיגיטליים שמציגים את המוצרים", potential: "נמוך" },
  "פלטפורמות מקוונות": { description: "מכירה דרך מרקטפלייסים — Amazon, Yad2, אחרים", potential: "בינוני" },
}

function getChannelMeta(name: string) {
  return CHANNEL_META[name] ?? {
    description: `ערוץ הפצה: ${name}`,
    potential: "בינוני" as const,
  }
}

const POTENTIAL_COLOR = {
  "גבוה": "bg-green-100 text-green-700 border-green-200",
  "בינוני": "bg-yellow-100 text-yellow-700 border-yellow-200",
  "נמוך": "bg-gray-100 text-gray-500 border-gray-200",
}

const ACTIVE_KEY = "distribution_channels_active"

function loadActive(): Set<string> {
  try {
    const stored = localStorage.getItem(ACTIVE_KEY)
    return stored ? new Set(JSON.parse(stored)) : new Set()
  } catch { return new Set() }
}

function saveActive(active: Set<string>) {
  localStorage.setItem(ACTIVE_KEY, JSON.stringify([...active]))
}

export default function DistributionChannelsPage() {
  const [channels, setChannels] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [extracting, setExtracting] = useState(false)
  const [active, setActive] = useState<Set<string>>(new Set())
  const [syncDates, setSyncDates] = useState<{ last_sync_at: string | null; next_sync_at: string | null } | null>(null)
  const supabase = createClient()

  useEffect(() => {
    setActive(loadActive())
    loadChannels()
  }, [])

  async function extractWithAI() {
    setExtracting(true)
    try {
      const res = await fetch('/api/extract-distribution-channels', { method: 'POST' })
      const data = await res.json()
      if (data.channels?.length) {
        setChannels(data.channels)
      }
    } catch { /* silent */ }
    setExtracting(false)
  }

  async function loadChannels() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase
      .from('companies')
      .select('distribution_channels, business_profile, business_overview, last_sync_at, next_sync_at')
      .eq('id', user.id)
      .single()
    if (data?.distribution_channels && Array.isArray(data.distribution_channels) && data.distribution_channels.length > 0) {
      setChannels(data.distribution_channels)
    } else if ((data as any)?.business_profile?.distributionChannels?.length) {
      // Fallback: read from business_profile JSONB
      setChannels((data as any).business_profile.distributionChannels)
    }
    if (data) setSyncDates({ last_sync_at: (data as any).last_sync_at ?? null, next_sync_at: (data as any).next_sync_at ?? null })
    setLoading(false)
  }

  function toggleActive(name: string) {
    setActive(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      saveActive(next)
      return next
    })
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Truck className="h-6 w-6 text-primary" />ערוצי הפצה
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          הערוצים שדרכם העסק שלך מגיע ללקוחות — מזוהים אוטומטית מהפרופיל העסקי
        </p>
        {syncDates && (
          <p className="text-xs text-muted-foreground mt-1">
            עודכן: {syncDates.last_sync_at ? new Date(syncDates.last_sync_at).toLocaleDateString('he-IL') : '—'} | עדכון הבא: {syncDates.next_sync_at ? new Date(syncDates.next_sync_at).toLocaleDateString('he-IL') : '—'}
          </p>
        )}
      </div>

      {channels.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Truck className="h-10 w-10 text-muted-foreground/40" />
            <div>
              <p className="font-medium">ערוצי הפצה לא זוהו עדיין</p>
              <p className="text-sm text-muted-foreground mt-1">
                ערוצי ההפצה מזוהים אוטומטית מהפרופיל העסקי שלך
              </p>
            </div>
            <Button
              onClick={extractWithAI}
              disabled={extracting}
              variant="outline"
              className="mt-2"
            >
              {extracting
                ? <><Loader2 className="ml-2 h-4 w-4 animate-spin" />מחלץ...</>
                : <><Sparkles className="ml-2 h-4 w-4" />זהה ערוצי הפצה עם AI</>
              }
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Info className="h-4 w-4 shrink-0" />
            <span>סמן ערוצים שאתה כבר משתמש בהם — זה יעזור לאסטרטגיית הצמיחה שלך</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {channels.map((channel) => {
              const meta = getChannelMeta(channel)
              const isActive = active.has(channel)
              return (
                <Card
                  key={channel}
                  className={`transition-all ${isActive ? 'border-primary/40 bg-primary/5 shadow-sm' : 'hover:shadow-sm'}`}
                >
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="flex items-center justify-between text-sm">
                      <span className="font-semibold">{channel}</span>
                      <Badge className={`text-xs border ${POTENTIAL_COLOR[meta.potential]}`}>
                        {meta.potential}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-3">
                    <p className="text-xs text-muted-foreground leading-relaxed">{meta.description}</p>
                    <Button
                      size="sm"
                      variant={isActive ? "default" : "outline"}
                      className="w-full"
                      onClick={() => toggleActive(channel)}
                    >
                      {isActive
                        ? <><CheckCircle2 className="ml-2 h-3.5 w-3.5" />פעיל</>
                        : <><Circle className="ml-2 h-3.5 w-3.5" />סמן כפעיל</>
                      }
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {active.size} מתוך {channels.length} ערוצים מסומנים כפעילים
          </p>
        </>
      )}
    </div>
  )
}
