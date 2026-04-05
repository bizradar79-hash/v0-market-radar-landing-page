"use client"

export const dynamic = 'force-dynamic'

import WeeklyActionsBlock from "@/components/dashboard/WeeklyActionsBlock"
import MarketAnalysisBlock from "@/components/dashboard/MarketAnalysisBlock"
import NicheDiscoveryBlock from "@/components/dashboard/NicheDiscoveryBlock"
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
          המלצות AI, ניתוח שוק וגילוי נישות חדשות
        </p>
      </div>

      {/* 1. המלצות AI (renamed from "מה נעשה השבוע") */}
      <section>
        <WeeklyActionsBlock />
      </section>

      {/* 2. ניתוח שוק */}
      <section>
        <MarketAnalysisBlock />
      </section>

      {/* 3. מצא נישה חדשה */}
      <section>
        <NicheDiscoveryBlock />
      </section>
    </div>
  )
}
