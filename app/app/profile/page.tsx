"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Building2,
  Loader2,
  Star,
  RefreshCw,
  Sparkles,
  Plus,
  TrendingUp,
  TrendingDown,
  Minus,
  Phone,
  Globe,
  MapPin,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface SwotData {
  strengths: string[]
  weaknesses: string[]
  opportunities: string[]
  threats: string[]
}

interface PlacesData {
  rating: number | null
  reviewCount: number
  reviews: Array<{ author: string; rating: number; text: string; time: string }>
  address?: string
  phone?: string
  website?: string
  source?: string
  error?: string
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={`h-4 w-4 ${i <= Math.round(rating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
        />
      ))}
    </div>
  )
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true)
  const [generatingOverview, setGeneratingOverview] = useState(false)
  const [generatingSwot, setGeneratingSwot] = useState(false)
  const [loadingPlaces, setLoadingPlaces] = useState(false)

  const [companyName, setCompanyName] = useState("")
  const [companyCity, setCompanyCity] = useState("")
  const [overview, setOverview] = useState<string>("")
  const [swot, setSwot] = useState<SwotData | null>(null)
  const [places, setPlaces] = useState<PlacesData | null>(null)

  const supabase = createClient()
  const { toast } = useToast()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('companies')
      .select('name, city, swot, business_overview, geo_data')
      .eq('id', user.id)
      .single()

    if (data) {
      setCompanyName(data.name || '')
      setCompanyCity(data.city || '')
      if (data.business_overview) setOverview(data.business_overview)
      if (data.swot && Object.keys(data.swot).length > 0) setSwot(data.swot as SwotData)
      if (data.geo_data && typeof data.geo_data === 'object' && Object.keys(data.geo_data).length > 0) {
        setPlaces(data.geo_data as PlacesData)
      }
    }
    setLoading(false)
  }

  async function generateOverview() {
    setGeneratingOverview(true)
    try {
      const res = await fetch('/api/generate-overview', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setOverview(data.overview)
        toast({ title: "הסקירה עודכנה בהצלחה" })
      } else {
        toast({ title: "שגיאה", description: data.error || "לא הצלחנו ליצור סקירה", variant: "destructive" })
      }
    } catch {
      toast({ title: "שגיאה", description: "אירעה שגיאה", variant: "destructive" })
    } finally {
      setGeneratingOverview(false)
    }
  }

  async function generateSwot() {
    setGeneratingSwot(true)
    try {
      const res = await fetch('/api/generate-swot', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setSwot(data.swot)
        toast({ title: "ניתוח SWOT נוצר בהצלחה" })
      } else {
        toast({ title: "שגיאה", description: data.error || "לא הצלחנו ליצור ניתוח", variant: "destructive" })
      }
    } catch {
      toast({ title: "שגיאה", description: "אירעה שגיאה", variant: "destructive" })
    } finally {
      setGeneratingSwot(false)
    }
  }

  async function loadPlaces() {
    setLoadingPlaces(true)
    try {
      const res = await fetch('/api/google-places')
      setPlaces(await res.json())
    } catch {
      setPlaces({ rating: null, reviewCount: 0, reviews: [], error: 'שגיאה בטעינת נתוני Google' })
    } finally {
      setLoadingPlaces(false)
    }
  }

  // Map URL uses business name + city from Supabase profile
  const mapQuery = encodeURIComponent(`${companyName} ${companyCity}`.trim())

  // Sort reviews for best/worst display
  const bestReviews = places?.reviews?.length
    ? [...places.reviews].sort((a, b) => b.rating - a.rating).slice(0, 3)
    : []
  const worstReviews = places?.reviews?.length
    ? [...places.reviews].sort((a, b) => a.rating - b.rating).filter(r => r.rating < 4).slice(0, 3)
    : []

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">פרופיל עסקי</h1>
        <p className="text-muted-foreground">סקירה ונוכחות גיאוגרפית של העסק</p>
      </div>

      {/* Section 1: Business Overview */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              סקירת העסק
            </CardTitle>
            <Button onClick={generateOverview} disabled={generatingOverview} variant="outline" size="sm">
              {generatingOverview
                ? <><Loader2 className="ml-2 h-4 w-4 animate-spin" />מייצר...</>
                : <><RefreshCw className="ml-2 h-4 w-4" />עדכן סקירה</>
              }
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {overview ? (
            <p className="text-foreground leading-relaxed">{overview}</p>
          ) : (
            <div className="flex flex-col items-center gap-3 py-6">
              <p className="text-sm text-muted-foreground">לחץ על "עדכן סקירה" לקבלת תיאור עסקי מ-AI</p>
              <Button onClick={generateOverview} disabled={generatingOverview}>
                {generatingOverview
                  ? <><Loader2 className="ml-2 h-4 w-4 animate-spin" />מייצר...</>
                  : <><Sparkles className="ml-2 h-4 w-4" />צור סקירה עסקית</>
                }
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 2: SWOT */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              ניתוח SWOT
            </CardTitle>
            <Button onClick={generateSwot} disabled={generatingSwot} variant="outline" size="sm">
              {generatingSwot
                ? <><Loader2 className="ml-2 h-4 w-4 animate-spin" />מנתח...</>
                : <><Sparkles className="ml-2 h-4 w-4" />{swot ? 'עדכן ניתוח' : 'צור ניתוח AI'}</>
              }
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!swot ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <p className="text-sm text-muted-foreground">לחץ על "צור ניתוח AI" לקבלת ניתוח SWOT</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <h3 className="mb-3 flex items-center gap-2 font-semibold text-green-800">
                  <TrendingUp className="h-4 w-4" />חוזקות
                </h3>
                <ul className="space-y-1.5">
                  {swot.strengths.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-green-700">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />{s}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <h3 className="mb-3 flex items-center gap-2 font-semibold text-red-800">
                  <TrendingDown className="h-4 w-4" />חולשות
                </h3>
                <ul className="space-y-1.5">
                  {swot.weaknesses.map((w, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-red-700">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />{w}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <h3 className="mb-3 flex items-center gap-2 font-semibold text-blue-800">
                  <Plus className="h-4 w-4" />הזדמנויות
                </h3>
                <ul className="space-y-1.5">
                  {swot.opportunities.map((o, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-blue-700">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />{o}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                <h3 className="mb-3 flex items-center gap-2 font-semibold text-yellow-800">
                  <Minus className="h-4 w-4" />איומים
                </h3>
                <ul className="space-y-1.5">
                  {swot.threats.map((t, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-yellow-800">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-500" />{t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Geographic Presence */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              נוכחות גיאוגרפית
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={loadPlaces} disabled={loadingPlaces}>
              {loadingPlaces
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <><RefreshCw className="ml-1 h-4 w-4" />רענן</>
              }
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Map using name + city from Supabase profile */}
          {companyCity ? (
            <div className="overflow-hidden rounded-lg border">
              <iframe
                src={`https://maps.google.com/maps?q=${mapQuery}&output=embed`}
                className="h-64 w-full"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="מפה"
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-2">לא הוגדרה עיר בפרופיל</p>
          )}

          {/* Load button when data not fetched yet */}
          {!places && (
            <div className="flex flex-col items-center gap-3 py-4">
              <p className="text-sm text-muted-foreground">טען כתובת, טלפון ואתר מ-Google</p>
              <Button variant="outline" onClick={loadPlaces} disabled={loadingPlaces}>
                {loadingPlaces
                  ? <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  : <RefreshCw className="ml-2 h-4 w-4" />
                }
                טען נתונים
              </Button>
            </div>
          )}

          {/* Address / phone / website from Serper knowledge graph */}
          {places && (places.address || places.phone || places.website) && (
            <div className="grid gap-2 text-sm">
              {places.address && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4 shrink-0" />
                  <span>{places.address}</span>
                </div>
              )}
              {places.phone && (
                <div className="flex items-center gap-2 text-muted-foreground" dir="ltr">
                  <Phone className="h-4 w-4 shrink-0" />
                  <span>{places.phone}</span>
                </div>
              )}
              {places.website && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Globe className="h-4 w-4 shrink-0" />
                  <a href={places.website} target="_blank" rel="noopener noreferrer"
                     className="text-primary hover:underline truncate" dir="ltr">
                    {places.website.replace(/^https?:\/\//, '')}
                  </a>
                </div>
              )}
            </div>
          )}

          {/* No contact info found */}
          {places && !places.address && !places.phone && !places.website && (
            <p className="text-sm text-muted-foreground">לא נמצאו פרטי קשר ב-Google</p>
          )}
        </CardContent>
      </Card>

      {/* Section 4: Google Rating & Reviews */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-primary" />
            דירוג גוגל וביקורות
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!places ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <p className="text-sm text-muted-foreground">טען דירוג וביקורות מ-Google</p>
              <Button variant="outline" onClick={loadPlaces} disabled={loadingPlaces}>
                {loadingPlaces
                  ? <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  : <Star className="ml-2 h-4 w-4" />
                }
                טען מ-Google
              </Button>
            </div>
          ) : !places.rating ? (
            <p className="text-sm text-muted-foreground text-center py-6">אין ביקורות זמינות</p>
          ) : (
            <div className="space-y-5">
              {/* Rating summary */}
              <div className="flex items-center gap-3">
                <span className="text-4xl font-bold">{places.rating.toFixed(1)}</span>
                <div>
                  <StarRating rating={places.rating} />
                  <p className="text-xs text-muted-foreground mt-1">{places.reviewCount} ביקורות ב-Google</p>
                </div>
              </div>

              {/* Best reviews */}
              {bestReviews.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-green-700">ביקורות טובות</p>
                  {bestReviews.map((review, i) => (
                    <div key={i} className="rounded-lg border border-green-100 bg-green-50/50 p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{review.author || 'לקוח'}</span>
                        <div className="flex items-center gap-2">
                          <StarRating rating={review.rating} />
                          {review.time && <span className="text-xs text-muted-foreground">{review.time}</span>}
                        </div>
                      </div>
                      {review.text && <p className="text-sm text-muted-foreground line-clamp-3">{review.text}</p>}
                    </div>
                  ))}
                </div>
              )}

              {/* Worst reviews (only show if rating < 4) */}
              {worstReviews.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-red-700">ביקורות שליליות</p>
                  {worstReviews.map((review, i) => (
                    <div key={i} className="rounded-lg border border-red-100 bg-red-50/50 p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{review.author || 'לקוח'}</span>
                        <div className="flex items-center gap-2">
                          <StarRating rating={review.rating} />
                          {review.time && <span className="text-xs text-muted-foreground">{review.time}</span>}
                        </div>
                      </div>
                      {review.text && <p className="text-sm text-muted-foreground line-clamp-3">{review.text}</p>}
                    </div>
                  ))}
                </div>
              )}

              {/* No reviews available (has rating but no review text) */}
              {bestReviews.length === 0 && (
                <p className="text-sm text-muted-foreground">אין ביקורות זמינות</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
