"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Lightbulb,
  Users,
  UserPlus,
  FileText,
  TrendingUp,
  Newspaper,
  FileBarChart,
  Bell,
  Settings,
  Radar,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"

const navItems = [
  { href: "/dashboard", label: "דשבורד", icon: LayoutDashboard },
  { href: "/dashboard/opportunities", label: "הזדמנויות", icon: Lightbulb, badge: 12 },
  { href: "/dashboard/competitors", label: "מתחרים", icon: Users },
  { href: "/dashboard/leads", label: "לידים", icon: UserPlus, badge: 8 },
  { href: "/dashboard/tenders", label: "מכרזים", icon: FileText, badge: 3 },
  { href: "/dashboard/trends", label: "טרנדים", icon: TrendingUp },
  { href: "/dashboard/news", label: "חדשות", icon: Newspaper },
  { href: "/dashboard/reports", label: "דוחות", icon: FileBarChart },
  { href: "/dashboard/alerts", label: "התראות", icon: Bell, badge: 5 },
  { href: "/dashboard/settings", label: "הגדרות", icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-64 border-l border-border bg-[#0d1526] flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Radar className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="font-bold text-foreground text-lg">Market Radar</h1>
            <p className="text-xs text-muted-foreground">Israel AI</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="flex-1">{item.label}</span>
              {item.badge && (
                <Badge 
                  variant="secondary" 
                  className={cn(
                    "text-xs px-2 py-0.5",
                    isActive ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"
                  )}
                >
                  {item.badge}
                </Badge>
              )}
            </Link>
          )
        })}
      </nav>

      {/* User section */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-secondary/50">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
            <span className="text-primary font-medium">יב</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">יוסי ברנר</p>
            <p className="text-xs text-muted-foreground truncate">חבילה עסקית</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
