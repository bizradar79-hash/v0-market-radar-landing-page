"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Users,
  Target,
  FileText,
  TrendingUp,
  Newspaper,
  FileBarChart,
  Settings,
  X,
  LogOut,
  Calendar,
  UserCircle,
  ShieldCheck,
  BarChart2,
  Truck,
  SlidersHorizontal,
  Bookmark,
  Crosshair,
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
  tenders: number
  competitors: number
  trends: number
  news: number
  conferences: number
  saved: number
}

const getNavGroups = (counts: NavCounts) => [
  {
    title: "🚀 מנוע צמיחה",
    items: [
      { href: "/app/dashboard", label: "דשבורד", icon: LayoutDashboard },
      { href: "/app/profile", label: "פרופיל עסקי", icon: UserCircle },
      { href: "/app/distribution-channels", label: "ערוצי הפצה", icon: Truck },
      { href: "/app/opportunities", label: "מרכז הזדמנויות", icon: Users },
    ],
  },
  {
    title: "📊 מודיעין שוק",
    items: [
      { href: "/app/competitors", label: "מתחרים", icon: Target, badge: counts.competitors || undefined },
      { href: "/app/trends", label: "טרנדים", icon: TrendingUp, badge: counts.trends || undefined },
      { href: "/app/seo-geo", label: "דירוג SEO/GEO", icon: BarChart2 },
    ],
  },
  {
    title: "🤝 פיתוח עסקי",
    items: [
      { href: "/app/tenders", label: "מכרזים", icon: FileText, badge: counts.tenders || undefined },
      { href: "/app/conferences", label: "כנסים", icon: Calendar, badge: counts.conferences || undefined },
      { href: "/app/news", label: "חדשות", icon: Newspaper, badge: counts.news || undefined },
    ],
  },
  {
    title: "⚙️ ניהול מערכת",
    items: [
      { href: "/app/saved", label: "פריטים שמורים", icon: Bookmark, badge: counts.saved || undefined },
      { href: "/app/reports", label: "דוחות", icon: FileBarChart },
      { href: "/app/settings", label: "הגדרות", icon: Settings },
    ],
  },
]

export default function AppSidebar({ isOpen, onClose }: AppSidebarProps) {
  const pathname = usePathname()
  const [user, setUser] = useState<UserData | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isImpersonating, setIsImpersonating] = useState(false)
  const [counts, setCounts] = useState<NavCounts>({
    tenders: 0,
    competitors: 0,
    trends: 0,
    news: 0,
    conferences: 0,
    saved: 0,
  })

  const fetchCounts = useCallback(async () => {
    const supabase = createClient()

    const [
      { count: tendersCount },
      { count: competitorsCount },
      { count: trendsCount },
      { count: newsCount },
      { count: conferencesCount },
    ] = await Promise.all([
      supabase.from("tenders").select("*", { count: "exact", head: true }),
      supabase.from("competitors").select("*", { count: "exact", head: true }),
      supabase.from("trends").select("*", { count: "exact", head: true }),
      supabase.from("news").select("*", { count: "exact", head: true }),
      supabase.from("conferences").select("*", { count: "exact", head: true }),
    ])

    // Fetch saved items count
    let savedCount = 0
    try {
      const res = await fetch('/api/saved-items')
      if (res.ok) {
        const data = await res.json()
        savedCount = (data.items || []).length
      }
    } catch {}

    setCounts({
      tenders: tendersCount || 0,
      competitors: competitorsCount || 0,
      trends: trendsCount || 0,
      news: newsCount || 0,
      conferences: conferencesCount || 0,
      saved: savedCount,
    })
  }, [])

  useEffect(() => {
    const impersonating = sessionStorage.getItem('is_impersonating') === 'true'
    setIsImpersonating(impersonating)

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

        if (!impersonating) {
          const { data: role } = await supabase
            .from('user_roles').select('is_admin').eq('user_id', authUser.id).single()
          if (role?.is_admin) setIsAdmin(true)
        }
      }
    }

    fetchUser()
    fetchCounts()
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

  const showAdminNav = isAdmin && !isImpersonating
  const navGroups = getNavGroups(counts)

  return (
    <aside
      className={cn(
        "fixed right-0 top-0 z-50 h-full w-64 border-l border-border bg-card transition-transform duration-300 lg:static lg:translate-x-0",
        isOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
      )}
    >
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center justify-between overflow-hidden border-b border-border px-4">
          <Link href={showAdminNav ? "/app/admin/impersonate" : "/app/dashboard"} className="flex items-center gap-2">
            <Image src="/whitelogo.png" alt="North Star Radar" width={160} height={40} className="h-9 w-auto object-contain" unoptimized />
            {showAdminNav && (
              <span className="text-xs text-muted-foreground">Admin</span>
            )}
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
        <nav className="flex-1 p-3 overflow-y-auto">
          {showAdminNav ? (
            <div>
              <div className="px-3 pb-1 pt-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">
                🛡 ניהול מערכת
              </div>
              <div className="space-y-0.5">
                <Link
                  href="/app/admin/impersonate"
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    pathname === "/app/admin/impersonate"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  <ShieldCheck className="h-5 w-5" />
                  <span>לוח אדמין</span>
                </Link>
                <Link
                  href="/app/admin/prompts"
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    pathname === "/app/admin/prompts"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  <SlidersHorizontal className="h-5 w-5" />
                  <span>ניהול פרומפטים</span>
                </Link>
                <Link
                  href="/app/admin/tenders-engine"
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    pathname === "/app/admin/tenders-engine"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  <Crosshair className="h-5 w-5" />
                  <span>מנוע מכרזים</span>
                </Link>
              </div>
            </div>
          ) : (
            navGroups.map((group, groupIndex) => (
              <div key={group.title}>
                <div className={cn(
                  "px-3 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right",
                  groupIndex === 0 ? "pt-2" : "pt-4 border-t border-border mt-2"
                )}>
                  {group.title}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
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
                </div>
              </div>
            ))
          )}
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
