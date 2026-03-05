"use client"

import { Bell, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

interface DashboardHeaderProps {
  alertCount: number
}

export function DashboardHeader({ alertCount }: DashboardHeaderProps) {
  return (
    <header className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold text-foreground">דשבורד</h1>
        <p className="text-muted-foreground text-sm">
          ברוכים הבאים חזרה! הנה סקירה של הפעילות העסקית שלך
        </p>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="חיפוש..."
            className="pr-10 w-64 bg-secondary border-border"
          />
        </div>

        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {alertCount > 0 && (
            <Badge 
              className="absolute -top-1 -left-1 w-5 h-5 p-0 flex items-center justify-center bg-primary text-primary-foreground text-xs"
            >
              {alertCount}
            </Badge>
          )}
        </Button>
      </div>
    </header>
  )
}
