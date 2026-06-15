"use client"

export const dynamic = 'force-dynamic'

import WeeklyActionsBlock from "@/components/dashboard/WeeklyActionsBlock"
import { Lightbulb } from "lucide-react"

export default function OpportunitiesPage() {
  return (
    <div className="space-y-8" dir="rtl">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Lightbulb className="h-6 w-6 text-primary" />
          מרכז הזדמנויות
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          הפעולות המומלצות לעסק שלך לשבוע הנוכחי, מבוססות על הסריקה האחרונה
        </p>
      </div>

      {/* מה לעשות השבוע — display-only, updated via scans */}
      <section>
        <WeeklyActionsBlock />
      </section>
    </div>
  )
}
