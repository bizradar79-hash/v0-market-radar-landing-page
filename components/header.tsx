"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Menu, X, Radar } from "lucide-react"

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const navItems = [
    { label: "יכולות", href: "#features" },
    { label: "איך זה עובד", href: "#how-it-works" },
    { label: "תמחור", href: "#pricing" },
    { label: "שאלות", href: "#faq" },
  ]

  return (
    <header className="fixed top-0 right-0 left-0 z-50 bg-[#1e3a5f]">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        {/* Logo */}
        <a href="#" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-primary/50">
            <Radar className="h-5 w-5 text-primary" />
          </div>
          <span className="text-lg font-semibold text-white">Market Radar</span>
        </a>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-8 md:flex">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm text-gray-300 transition-colors hover:text-white"
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Desktop CTAs */}
        <div className="hidden items-center gap-3 md:flex">
          <Button variant="ghost" className="text-gray-300 hover:text-white hover:bg-transparent" asChild>
            <Link href="/login">התחבר</Link>
          </Button>
          <Button className="bg-[#e85a7e] text-white hover:bg-[#d14a6e] rounded-md px-5" asChild>
            <Link href="/signup">התחל ניסיון</Link>
          </Button>
        </div>

        {/* Mobile Menu Button */}
        <button
          className="md:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? "סגור תפריט" : "פתח תפריט"}
        >
          {mobileMenuOpen ? (
            <X className="h-6 w-6 text-white" />
          ) : (
            <Menu className="h-6 w-6 text-white" />
          )}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="bg-[#1e3a5f] md:hidden">
          <nav className="flex flex-col gap-4 px-4 py-6">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-gray-300 transition-colors hover:text-white"
                onClick={() => setMobileMenuOpen(false)}
              >
                {item.label}
              </a>
            ))}
            <div className="mt-4 flex flex-col gap-3">
              <Button variant="outline" className="w-full border-gray-500 text-white hover:bg-white/10" asChild>
                <Link href="/login">התחבר</Link>
              </Button>
              <Button className="w-full bg-[#e85a7e] text-white hover:bg-[#d14a6e]" asChild>
                <Link href="/signup">התחל ניסיון</Link>
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
