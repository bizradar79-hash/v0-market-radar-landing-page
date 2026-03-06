"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Bell, Search, Menu, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { createClient } from "@/lib/supabase/client"

interface AppHeaderProps {
  onMenuClick: () => void
}

interface Alert {
  id: string
  title: string
  message: string
  type: string
  is_read: boolean
  link?: string
  created_at: string
}

export default function AppHeader({ onMenuClick }: AppHeaderProps) {
  const router = useRouter()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const supabase = createClient()

  useEffect(() => {
    fetchAlerts()
    const interval = setInterval(fetchAlerts, 30000)
    return () => clearInterval(interval)
  }, [])

  async function fetchAlerts() {
    const { data, error } = await supabase
      .from("alerts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10)

    if (!error && data) {
      setAlerts(data)
      setUnreadCount(data.filter(a => !a.is_read).length)
    }
  }

  async function markAsRead(alertId: string) {
    await supabase
      .from("alerts")
      .update({ is_read: true })
      .eq("id", alertId)
    
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, is_read: true } : a))
    setUnreadCount(prev => Math.max(0, prev - 1))
    
    // Refresh sidebar counts
    if ((window as typeof window & { refreshSidebarCounts?: () => void }).refreshSidebarCounts) {
      (window as typeof window & { refreshSidebarCounts?: () => void }).refreshSidebarCounts()
    }
  }

  async function markAllAsRead() {
    const unreadIds = alerts.filter(a => !a.is_read).map(a => a.id)
    if (unreadIds.length === 0) return

    await supabase
      .from("alerts")
      .update({ is_read: true })
      .in("id", unreadIds)
    
    setAlerts(prev => prev.map(a => ({ ...a, is_read: true })))
    setUnreadCount(0)
    
    if ((window as typeof window & { refreshSidebarCounts?: () => void }).refreshSidebarCounts) {
      (window as typeof window & { refreshSidebarCounts?: () => void }).refreshSidebarCounts()
    }
  }

  function handleAlertClick(alert: Alert) {
    if (!alert.is_read) {
      markAsRead(alert.id)
    }
    if (alert.link) {
      router.push(alert.link)
    }
  }

  function getAlertTypeColor(type: string) {
    switch (type) {
      case "success": return "bg-green-500"
      case "warning": return "bg-yellow-500"
      case "error": return "bg-red-500"
      default: return "bg-primary"
    }
  }

  function formatTimeAgo(dateStr: string): string {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))
    
    if (diffMinutes < 1) return "עכשיו"
    if (diffMinutes < 60) return `לפני ${diffMinutes} דקות`
    const diffHours = Math.floor(diffMinutes / 60)
    if (diffHours < 24) return `לפני ${diffHours} שעות`
    const diffDays = Math.floor(diffHours / 24)
    return `לפני ${diffDays} ימים`
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card/95 px-4 backdrop-blur lg:px-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onMenuClick}
        >
          <Menu className="h-5 w-5" />
        </Button>
        
        <div className="relative hidden sm:block">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="חיפוש..."
            className="w-64 bg-secondary/50 pr-10"
            dir="rtl"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -left-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80" dir="rtl">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <span className="font-semibold text-sm">התראות</span>
              {unreadCount > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-auto p-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={markAllAsRead}
                >
                  <Check className="h-3 w-3 ml-1" />
                  סמן הכל כנקרא
                </Button>
              )}
            </div>
            
            {alerts.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                אין התראות חדשות
              </div>
            ) : (
              <>
                {alerts.map((alert) => (
                  <DropdownMenuItem
                    key={alert.id}
                    className={`flex flex-col items-start gap-1 p-3 cursor-pointer ${!alert.is_read ? 'bg-primary/5' : ''}`}
                    onClick={() => handleAlertClick(alert)}
                  >
                    <div className="flex items-center gap-2 w-full">
                      <div className={`h-2 w-2 rounded-full ${getAlertTypeColor(alert.type)}`} />
                      <span className={`text-sm flex-1 ${!alert.is_read ? 'font-semibold' : ''}`}>
                        {alert.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatTimeAgo(alert.created_at)}
                      </span>
                    </div>
                    {alert.message && (
                      <p className="text-xs text-muted-foreground line-clamp-2 pr-4">
                        {alert.message}
                      </p>
                    )}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  className="text-center text-sm text-primary cursor-pointer justify-center"
                  onClick={() => router.push('/app/alerts')}
                >
                  צפה בכל ההתראות
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
