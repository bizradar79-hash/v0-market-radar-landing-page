"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import {
  Calendar,
  MapPin,
  ExternalLink,
  Loader2,
  Sparkles,
  Tag,
} from "lucide-react"

function getHostname(url: string): string | null {
  try { return new URL(url).hostname } catch { return null }
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
  const [generating, setGenerating] = useState(false)
  const supabase = createClient()
  const { toast } = useToast()

  useEffect(() => {
    fetchConferences()
  }, [])

  async function fetchConferences() {
    const { data, error } = await supabase
      .from("conferences")
      .select("*")
      .order("date", { ascending: true })

    if (!error && data) {
      setConferences(data)
    }
    setLoading(false)
  }

  async function generateWithAI() {
    setGenerating(true)
    try {
      const response = await fetch("/api/generate-conferences", { method: "POST" })
      const data = await response.json()
      
      if (data.success) {
        await fetchConferences()
        toast({
          title: "הכנסים נוצרו בהצלחה",
          description: `נמצאו ${data.count || 0} כנסים רלוונטיים`,
        })
      } else {
        toast({
          title: "שגיאה",
          description: data.error || "לא הצלחנו ליצור כנסים",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error generating conferences:", error)
      toast({
        title: "שגיאה",
        description: "אירעה שגיאה ביצירת הכנסים",
        variant: "destructive",
      })
    } finally {
      setGenerating(false)
    }
  }

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      "טכנולוגיה": "bg-blue-100 text-blue-800",
      "עסקים": "bg-green-100 text-green-800",
      "סטארטאפים": "bg-purple-100 text-purple-800",
      "פיננסים": "bg-yellow-100 text-yellow-800",
      "חדשנות": "bg-pink-100 text-pink-800",
    }
    return colors[category] || "bg-gray-100 text-gray-800"
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">כנסים ואירועים</h1>
          <p className="text-muted-foreground">
            {conferences.length} כנסים נמצאו
          </p>
        </div>
        <Button 
          onClick={generateWithAI} 
          disabled={generating}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {generating ? (
            <>
              <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              מחפש כנסים...
            </>
          ) : (
            <>
              <Sparkles className="ml-2 h-4 w-4" />
              מצא כנסים עם AI
            </>
          )}
        </Button>
      </div>

      {/* Empty State */}
      {conferences.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
              <Calendar className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">אין כנסים להצגה</h3>
            <p className="text-muted-foreground max-w-md mb-4">
              לחץ על הכפתור למעלה כדי למצוא כנסים רלוונטיים לתחום שלך
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {conferences.map((conference) => (
            <Card key={conference.id} className="border-border bg-card hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg font-semibold text-foreground leading-tight">
                    {conference.name}
                  </CardTitle>
                  <Badge className={getCategoryColor(conference.category)}>
                    {conference.category}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {conference.description}
                </p>
                
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

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => window.open(conference.url, '_blank')}
                >
                  <ExternalLink className="ml-2 h-4 w-4" />
                  הירשם לכנס
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
