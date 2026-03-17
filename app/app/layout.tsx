"use client"

import { useState, useEffect } from "react"
import AppSidebar from "@/components/app/app-sidebar"
import AppHeader from "@/components/app/app-header"
import ImpersonationBanner from "@/components/admin/ImpersonationBanner"

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [impersonating, setImpersonating] = useState(false)

  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [sidebarOpen])

  useEffect(() => {
    setImpersonating(sessionStorage.getItem('is_impersonating') === 'true')
  }, [])

  return (
    <div className={`flex min-h-screen bg-background${impersonating ? ' pt-10' : ''}`}>
      <ImpersonationBanner />

      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <AppSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        <AppHeader onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
