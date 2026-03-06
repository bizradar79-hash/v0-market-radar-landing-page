"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Lightbulb,
  Users,
  Target,
  FileText,
  TrendingUp,
  Newspaper,
  FileBarChart,
  Bell,
  Settings,
  Radar,
  X,
  LogOut,
  Calendar,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"

interface AppSidebarProps {
  isOpen: boolean
  onClose: () => void
}

interface UserData {
  name: string
  email: string
  initials: string
}

interface NavCounts {
  opportunities: number
  leads: number
  tenders: number
  alerts: number
  competitors: number
  trends: number
  news: number
  conferences: number
}

const getNavItems = (counts: NavCounts) => [
  { href: "/app/dashboard", label: "דשבורד", icon: LayoutDashboard },
  { href: "/app/opportunities", label: "הזדמנויות", icon: Lightbulb, badge: counts.opportunities || undefined },
  { href: "/app/competitors", label: "מתחרים", icon: Target, badge: counts.competitors || undefined },
  { href: "/app/leads", label: "לידים", icon: Users, badge: counts.leads || undefined },
  { href: "/app/tenders", label: "מכרזים", icon: FileText, badge: counts.tenders || undefined },
  { href: "/app/trends", label: "טרנדים", icon: TrendingUp, badge: counts.trends || undefined },
  { href: "/app/news", label: "חדשות", icon: Newspaper, badge: counts.news || undefined },
  { href: "/app/conferences", label: "כנסים", icon: Calendar, badge: counts.conferences || undefined },
  { href: "/app/reports", label: "דוחות", icon: FileBarChart },
  { href: "/app/alerts", label: "התראות", icon: Bell, badge: counts.alerts || undefined },
  { href: "/app/settings", label: "הגדרות", icon: Settings },
]

export default function AppSidebar({ isOpen, onClose }: AppSidebarProps) {
  const pathname = usePathname()
  const [user, setUser] = useState<UserData | null>(null)
  const [counts, setCounts] = useState<NavCounts>({
    opportunities: 0,
    leads: 0,
    tenders: 0,
    alerts: 0,
    competitors: 0,
    trends: 0,
    news: 0,
    conferences: 0,
  })

  const fetchCounts = useCallback(async () => {
    const supabase = createClient()
    
    const [
      { count: opportunitiesCount },
      { count: leadsCount },
      { count: tendersCount },
      { count: alertsCount },
      { count: competitorsCount },
      { count: trendsCount },
      { count: newsCount },
      { count: conferencesCount },
    ] = await Promise.all([
      supabase.from("opportunities").select("*", { count: "exact", head: true }),
      supabase.from("leads").select("*", { count: "exact", head: true }),
      supabase.from("tenders").select("*", { count: "exact", head: true }),
      supabase.from("alerts").select("*", { count: "exact", head: true }).eq("is_read", false),
      supabase.from("competitors").select("*", { count: "exact", head: true }),
      supabase.from("trends").select("*", { count: "exact", head: true }),
      supabase.from("news").select("*", { count: "exact", head: true }),
      supabase.from("conferences").select("*", { count: "exact", head: true }),
    ])

    setCounts({
      opportunities: opportunitiesCount || 0,
      leads: leadsCount || 0,
      tenders: tendersCount || 0,
      alerts: alertsCount || 0,
      competitors: competitorsCount || 0,
      trends: trendsCount || 0,
      news: newsCount || 0,
      conferences: conferencesCount || 0,
    })
  }, [])

  useEffect(() => {
    const fetchUser = async () => {
      const supabase = createClient()
      const { data: { user: authUser } } = await supabase.auth.getUser()
      
      if (authUser) {
        const fullName = authUser.user_metadata?.full_name || 
                         authUser.user_metadata?.name ||
                         authUser.email?.split('@')[0] || 
                         'משתמש'
        
        const nameParts = fullName.split(' ')
        let initials = ''
        if (nameParts.length >= 2) {
          initials = nameParts[0].charAt(0) + nameParts[1].charAt(0)
        } else {
          initials = fullName.substring(0, 2)
        }
        
        setUser({
          name: fullName,
          email: authUser.email || '',
          initials: initials.toUpperCase()
        })
      }
    }

    fetchUser()
    fetchCounts()

    // Refresh counts every 30 seconds
    const interval = setInterval(fetchCounts, 30000)
    return () => clearInterval(interval)
  }, [fetchCounts])

  // Expose refresh function globally for other components to trigger
  useEffect(() => {
    (window as typeof window & { refreshSidebarCounts?: () => void }).refreshSidebarCounts = fetchCounts
  }, [fetchCounts])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const navItems = getNavItems(counts)

  return (
    <aside
      className={cn(
        "fixed right-0 top-0 z-50 h-full w-64 border-l border-border bg-card transition-transform duration-300 lg:static lg:translate-x-0",
        isOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
      )}
    >
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex items-center justify-between border-b border-border p-4">
          <Link href="/app/dashboard" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <Radar className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-foreground">Market Radar</span>
              <span className="text-xs text-muted-foreground">Israel AI</span>
            </div>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <div className="flex items-center gap-3">
                  <item.icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/20 px-1.5 text-xs font-semibold text-primary">
                    {item.badge}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* User section */}
        <div className="border-t border-border p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-primary">
              {user?.initials || '...'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {user?.name || 'טוען...'}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {user?.email || ''}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSignOut}
              className="text-muted-foreground hover:text-foreground"
              title="התנתק"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </aside>
  )
}
