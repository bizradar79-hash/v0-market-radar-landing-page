"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { 
  AlertTriangle, 
  Info, 
  CheckCircle, 
  Bell, 
  Target, 
  Users, 
  TrendingUp,
  Clock,
  Check,
  Loader2
} from "lucide-react"

interface Alert {
  id: string
  company_id: string
  title: string
  message: string
  type: string
  is_read: boolean
  created_at: string
}



function getAlertIcon(type: string) {
  switch (type) {
    case "warning":
      return <AlertTriangle className="h-5 w-5 text-yellow-500" />
    case "success":
      return <CheckCircle className="h-5 w-5 text-green-500" />
    default:
      return <Info className="h-5 w-5 text-blue-500" />
  }
}

function getTypeBadge(type: string) {
  switch (type) {
    case "warning":
      return "bg-yellow-500/10 text-yellow-500"
    case "success":
      return "bg-green-500/10 text-green-500"
    default:
      return "bg-blue-500/10 text-blue-500"
  }
}

function formatTimeAgo(dateString: string) {
  const date = new Date(dateString)
  const now = new Date()
  const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60))
  
  if (diffHours < 1) return "לפני פחות משעה"
  if (diffHours < 24) return `לפני ${diffHours} שעות`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return "לפני יום"
  return `לפני ${diffDays} ימים`
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    fetchAlerts()
  }, [])

  async function fetchAlerts() {
    const { data, error } = await supabase
      .from("alerts")
      .select("*")
      .order("created_at", { ascending: false })

    if (!error && data) {
      setAlerts(data)
    }
    setLoading(false)
  }

  const markAsRead = async (id: string) => {
    // Update local state immediately
    setAlerts(alerts.map(alert => 
      alert.id === id ? { ...alert, is_read: true } : alert
    ))
    
    // Update in database if it's a real alert
    await supabase
      .from("alerts")
      .update({ is_read: true })
      .eq("id", id)
  }

  const markAllAsRead = async () => {
    // Update local state immediately
    setAlerts(alerts.map(alert => ({ ...alert, is_read: true })))
    
    // Update all unread alerts in database
    const unreadIds = alerts.filter(a => !a.is_read).map(a => a.id)
    if (unreadIds.length > 0) {
      await supabase
        .from("alerts")
        .update({ is_read: true })
        .in("id", unreadIds)
    }
  }

  const unreadCount = alerts.filter(a => !a.is_read).length

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">התראות</h1>
          <p className="text-muted-foreground">
            {unreadCount} התראות חדשות
          </p>
        </div>
        {unreadCount > 0 && (
          <Button 
            variant="outline" 
            onClick={markAllAsRead}
            className="border-border"
          >
            <Check className="ml-2 h-4 w-4" />
            סמן הכל כנקרא
          </Button>
        )}
      </div>

      {/* Alerts List */}
      <div className="space-y-4">
        {alerts.map((alert) => (
          <Card 
            key={alert.id} 
            className={`border-border bg-card transition-colors ${
              !alert.is_read ? "border-r-4 border-r-primary" : ""
            }`}
          >
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className="mt-0.5">
                  {getAlertIcon(alert.type)}
                </div>
                
                <div className="flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge className={getTypeBadge(alert.type)}>
                      <Bell className="mr-1 h-3 w-3" />
                      התראה
                    </Badge>
                    {!alert.is_read && (
                      <Badge className="bg-primary/10 text-primary">
                        חדש
                      </Badge>
                    )}
                  </div>
                  
                  <h3 className="mb-1 text-lg font-semibold text-foreground">
                    {alert.title}
                  </h3>
                  
                  <p className="mb-3 text-sm text-muted-foreground">
                    {alert.message}
                  </p>
                  
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatTimeAgo(alert.created_at)}
                    </span>
                    
                    {!alert.is_read && (
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => markAsRead(alert.id)}
                        className="text-primary hover:text-primary/80"
                      >
                        סמן כנקרא
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {alerts.length === 0 && (
        <Card className="border-border bg-card">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Bell className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">אין התראות</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
