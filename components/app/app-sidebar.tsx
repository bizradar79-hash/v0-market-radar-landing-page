"use client"

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
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface AppSidebarProps {
  isOpen: boolean
  onClose: () => void
}

const navItems = [
  { href: "/app/dashboard", label: "דשבורד", icon: LayoutDashboard },
  { href: "/app/opportunities", label: "הזדמנויות", icon: Lightbulb, badge: 12 },
  { href: "/app/competitors", label: "מתחרים", icon: Target },
  { href: "/app/leads", label: "לידים", icon: Users, badge: 8 },
  { href: "/app/tenders", label: "מכרזים", icon: FileText, badge: 3 },
  { href: "/app/trends", label: "טרנדים", icon: TrendingUp },
  { href: "/app/news", label: "חדשות", icon: Newspaper },
  { href: "/app/reports", label: "דוחות", icon: FileBarChart },
  { href: "/app/alerts", label: "התראות", icon: Bell, badge: 5 },
  { href: "/app/settings", label: "הגדרות", icon: Settings },
]

export default function AppSidebar({ isOpen, onClose }: AppSidebarProps) {
  const pathname = usePathname()

  return (
    <aside
      className={cn(
        "fixed right-0 top-0 z-50 h-full w-64 border-l border-border bg-[#0a1628] transition-transform duration-300 lg:static lg:translate-x-0",
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
        <nav className="flex-1 space-y-1 p-3">
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
                {item.badge && (
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
              מר
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">משתמש ראשי</p>
              <p className="text-xs text-muted-foreground">חבילה עסקית</p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
