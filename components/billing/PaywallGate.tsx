"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Clock } from "lucide-react"

interface GateState {
  loading: boolean
  hasAccess: boolean
  pendingPayment: boolean
}

// Client-side paywall gate. When PAYWALL_ENFORCED=true (server env) and the
// user lacks an active/grace subscription, this blocks the wrapped content:
//  - pending_payment → shows "התשלום בעיבוד, ניצור קשר בקרוב"
//  - otherwise       → redirects to /checkout
// When the paywall is off, children render immediately (hasAccess is true).
export default function PaywallGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [state, setState] = useState<GateState>({ loading: true, hasAccess: true, pendingPayment: false })

  useEffect(() => {
    let cancelled = false
    fetch('/api/billing/gate')
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        if (data?.authenticated === false) {
          router.replace('/login')
          return
        }
        if (data?.hasAccess) {
          setState({ loading: false, hasAccess: true, pendingPayment: false })
          return
        }
        if (data?.pendingPayment) {
          setState({ loading: false, hasAccess: false, pendingPayment: true })
          return
        }
        // Enforced + no access + not pending → send to checkout.
        router.replace('/checkout')
      })
      .catch(() => {
        // On error, fail open so we never lock real users out.
        if (!cancelled) setState({ loading: false, hasAccess: true, pendingPayment: false })
      })
    return () => { cancelled = true }
  }, [router])

  if (state.loading) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (state.pendingPayment) {
    return (
      <div dir="rtl" className="flex min-h-svh w-full items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-xl border border-border bg-card/80 p-8 text-center">
          <Clock className="mx-auto mb-4 h-10 w-10 text-primary" />
          <h2 className="mb-2 text-xl font-bold text-foreground">התשלום בעיבוד</h2>
          <p className="text-sm text-muted-foreground">ניצור קשר בקרוב לאחר אישור התשלום.</p>
        </div>
      </div>
    )
  }

  if (!state.hasAccess) return null

  return <>{children}</>
}
