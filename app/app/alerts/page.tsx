"use client"

import { useState } from "react"
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
  Check
} from "lucide-react"

interface Alert {
  id: number
  title: string
  description: string
  type: "warning" | "info" | "success"
  category: string
  timeAgo: string
  isRead: boolean
}

const initialAlerts: Alert[] = [
  {
    id: 1,
    title: "מתחרה חדש בשוק",
    description: "זוהתה חברה חדשה שנכנסת לתחום הפעילות שלך - StartupAI Ltd",
    type: "warning",
    category: "מתחרים",
    timeAgo: "לפני 2 שעות",
    isRead: false,
  },
  {
    id: 2,
    title: "הזדמנות מכרז",
    description: "מכרז חדש רלוונטי פורסם - משרד הבריאות, תקציב 5 מיליון ש\"ח",
    type: "info",
    category: "מכרזים",
    timeAgo: "לפני 5 שעות",
    isRead: false,
  },
  {
    id: 3,
    title: "ליד חם",
    description: "ליד בעל ציון 90+ נכנס למערכת - חדשנות ישראל בע\"מ",
    type: "success",
    category: "לידים",
    timeAgo: "לפני 8 שעות",
    isRead: false,
  },
  {
    id: 4,
    title: "שינוי מחירים אצל מתחרה",
    description: "DataPro Solutions הורידו מחירים ב-15% בחבילה העסקית",
    type: "warning",
    category: "מתחרים",
    timeAgo: "לפני יום",
    isRead: true,
  },
  {
    id: 5,
    title: "טרנד עולה",
    description: "עלייה משמעותית בחיפושים לבינה מלאכותית גנרטיבית בישראל",
    type: "info",
    category: "טרנדים",
    timeAgo: "לפני יום",
    isRead: false,
  },
]

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

function getCategoryIcon(category: string) {
  switch (category) {
    case "מתחרים":
      return <Target className="h-4 w-4" />
    case "לידים":
      return <Users className="h-4 w-4" />
    case "טרנדים":
      return <TrendingUp className="h-4 w-4" />
    default:
      return <Bell className="h-4 w-4" />
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

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>(initialAlerts)

  const markAsRead = (id: number) => {
    setAlerts(alerts.map(alert => 
      alert.id === id ? { ...alert, isRead: true } : alert
    ))
  }

  const markAllAsRead = () => {
    setAlerts(alerts.map(alert => ({ ...alert, isRead: true })))
  }

  const unreadCount = alerts.filter(a => !a.isRead).length

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
              !alert.isRead ? "border-r-4 border-r-primary" : ""
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
                      {getCategoryIcon(alert.category)}
                      <span className="mr-1">{alert.category}</span>
                    </Badge>
                    {!alert.isRead && (
                      <Badge className="bg-primary/10 text-primary">
                        חדש
                      </Badge>
                    )}
                  </div>
                  
                  <h3 className="mb-1 text-lg font-semibold text-foreground">
                    {alert.title}
                  </h3>
                  
                  <p className="mb-3 text-sm text-muted-foreground">
                    {alert.description}
                  </p>
                  
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {alert.timeAgo}
                    </span>
                    
                    {!alert.isRead && (
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
    </div>
  )
}
