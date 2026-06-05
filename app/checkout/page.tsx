'use client'

export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Loader2, CheckCircle2, Tag, ShieldCheck } from 'lucide-react'

const BASE_AMOUNT = 79

export default function CheckoutPage() {
  const router = useRouter()
  const [checkingAuth, setCheckingAuth] = useState(true)

  const [code, setCode] = useState('')
  const [applying, setApplying] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Applied coupon state
  const [appliedCode, setAppliedCode] = useState<string | null>(null)
  const [finalAmount, setFinalAmount] = useState<number>(BASE_AMOUNT)
  const [couponLabel, setCouponLabel] = useState<string>('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.replace('/login'); return }
      // Already paid (active/grace) → skip straight to onboarding.
      const { data: sub } = await supabase
        .from('subscriptions').select('status').eq('user_id', data.user.id).maybeSingle()
      if (sub && (sub.status === 'active' || sub.status === 'grace')) {
        router.replace('/onboarding')
        return
      }
      setCheckingAuth(false)
    })
  }, [router])

  async function applyCoupon() {
    if (!code.trim()) return
    setApplying(true)
    setError(null)
    try {
      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (data.valid) {
        setAppliedCode(code.trim().toUpperCase())
        setFinalAmount(typeof data.finalAmount === 'number' ? data.finalAmount : BASE_AMOUNT)
        setCouponLabel(data.label || '')
      } else {
        setAppliedCode(null)
        setFinalAmount(BASE_AMOUNT)
        setCouponLabel('')
        setError('הקופון אינו תקף')
      }
    } catch (e: any) {
      setError('שגיאה באימות הקופון')
    } finally {
      setApplying(false)
    }
  }

  function clearCoupon() {
    setAppliedCode(null)
    setFinalAmount(BASE_AMOUNT)
    setCouponLabel('')
    setCode('')
    setError(null)
  }

  async function proceed() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: appliedCode || '' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'אירעה שגיאה, נסה שוב')
        setSubmitting(false)
        return
      }
      if (data.redirect) {
        router.push(data.redirect)
        return
      }
      if (data.url) {
        window.location.href = data.url
        return
      }
      setError('אירעה שגיאה, נסה שוב')
      setSubmitting(false)
    } catch (e: any) {
      setError('אירעה שגיאה, נסה שוב')
      setSubmitting(false)
    }
  }

  if (checkingAuth) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const isFree = appliedCode != null && finalAmount === 0

  return (
    <div dir="rtl" className="flex min-h-svh w-full items-center justify-center bg-background p-6 md:p-10">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 top-0 h-[500px] w-[500px] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -right-40 bottom-0 h-[500px] w-[500px] rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Image src="/whitelogo.png" alt="North Star Radar" width={200} height={56} className="h-12 w-auto object-contain" unoptimized />
        </div>

        <Card className="border-border bg-card/80 backdrop-blur-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold text-foreground">השלמת הרשמה</CardTitle>
            <CardDescription className="text-muted-foreground">
              עוד צעד אחד לפני שמתחילים
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Plan card */}
            <div className="rounded-xl border border-border bg-background/50 p-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground">North Star Radar</span>
                <div className="text-left">
                  {appliedCode && finalAmount !== BASE_AMOUNT ? (
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm text-muted-foreground line-through">{BASE_AMOUNT} ₪</span>
                      <span className="text-lg font-bold text-foreground">{finalAmount} ₪</span>
                    </div>
                  ) : (
                    <span className="text-lg font-bold text-foreground">{BASE_AMOUNT} ₪</span>
                  )}
                  <span className="block text-xs text-muted-foreground">/ חודש</span>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                מנוי חודשי בהוראת קבע. החיוב מתבצע דרך עמוד תשלום מאובטח של Upay.
              </p>
            </div>

            {/* Coupon row */}
            <div className="space-y-2">
              <Label htmlFor="coupon" className="flex items-center gap-1.5 text-sm">
                <Tag className="h-3.5 w-3.5" /> קוד קופון
              </Label>
              {appliedCode ? (
                <div className="flex items-center justify-between rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-2">
                  <span className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    {couponLabel || `קופון ${appliedCode} הוחל`}
                  </span>
                  <button type="button" onClick={clearCoupon} className="text-xs text-muted-foreground underline">
                    הסר
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    id="coupon"
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    placeholder="הזן קוד קופון"
                    className="flex-1"
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyCoupon() } }}
                  />
                  <Button type="button" variant="outline" onClick={applyCoupon} disabled={applying || !code.trim()}>
                    {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'החל קופון'}
                  </Button>
                </div>
              )}
            </div>

            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}

            {/* Proceed */}
            <Button className="w-full" onClick={proceed} disabled={submitting}>
              {submitting
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : isFree ? 'הפעל וקבל גישה' : 'המשך לתשלום'}
            </Button>

            <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              התשלום מאובטח ומעובד דרך Upay
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
