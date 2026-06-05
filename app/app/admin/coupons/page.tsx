"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Plus, Trash2, Tag, Sparkles, AlertCircle } from "lucide-react"

const BASE_AMOUNT = 79
type DiscountType = 'percent' | 'fixed' | 'free' | 'grace'
const PAID_TYPES: DiscountType[] = ['percent', 'fixed']

function computeFinalAmount(base: number, type: DiscountType, value: number): number {
  switch (type) {
    case 'percent': return Math.round(base * (1 - value / 100) * 100) / 100
    case 'fixed': return Math.max(0, base - value)
    case 'free': return 0
    case 'grace': return 0
    default: return base
  }
}

const TYPE_LABELS: Record<DiscountType, string> = {
  percent: 'אחוז הנחה',
  fixed: 'הנחה בש"ח',
  free: 'חינם',
  grace: 'חודשים חינם',
}

function genCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

interface Coupon {
  code: string
  discount_type: DiscountType
  discount_value: number
  payment_url: string | null
  scope: string
  active: boolean
  expires_at: string | null
  max_redemptions: number | null
  times_redeemed: number
  final_price: number
  redemptions: { coupon_code: string; user_id: string; redeemed_at: string }[]
}

export default function AdminCouponsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  // Form
  const [code, setCode] = useState('')
  const [discountType, setDiscountType] = useState<DiscountType>('percent')
  const [discountValue, setDiscountValue] = useState('')
  const [paymentUrl, setPaymentUrl] = useState('')
  const [scope, setScope] = useState('first_payment')
  const [expiresAt, setExpiresAt] = useState('')
  const [maxRedemptions, setMaxRedemptions] = useState('')
  const [active, setActive] = useState(true)

  useEffect(() => { checkAdminAndLoad() }, [])

  async function checkAdminAndLoad() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }
    const { data: role } = await supabase
      .from('user_roles').select('is_admin').eq('user_id', user.id).single()
    if (!role?.is_admin) { router.replace('/app/dashboard'); return }
    await loadCoupons()
  }

  async function loadCoupons() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/coupons')
      const data = await res.json().catch(() => ({}))
      setCoupons(Array.isArray(data.coupons) ? data.coupons : [])
    } finally {
      setLoading(false)
    }
  }

  function resetForm() {
    setCode(''); setDiscountType('percent'); setDiscountValue('')
    setPaymentUrl(''); setScope('first_payment'); setExpiresAt('')
    setMaxRedemptions(''); setActive(true)
  }

  function editCoupon(c: Coupon) {
    setCode(c.code)
    setDiscountType(c.discount_type)
    setDiscountValue(String(c.discount_value))
    setPaymentUrl(c.payment_url || '')
    setScope(c.scope)
    setExpiresAt(c.expires_at ? c.expires_at.slice(0, 10) : '')
    setMaxRedemptions(c.max_redemptions != null ? String(c.max_redemptions) : '')
    setActive(c.active)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const isPaid = PAID_TYPES.includes(discountType)
  const computedPrice = computeFinalAmount(BASE_AMOUNT, discountType, Number(discountValue) || 0)

  async function save() {
    if (!code.trim()) {
      toast({ title: "קוד קופון חסר", variant: "destructive" }); return
    }
    if (isPaid && !paymentUrl.trim()) {
      toast({ title: "קישור Upay נדרש", description: "קופון בתשלום חייב קישור לדף התשלום", variant: "destructive" }); return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code, discount_type: discountType, discount_value: Number(discountValue) || 0,
          payment_url: paymentUrl, scope, active,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
          max_redemptions: maxRedemptions === '' ? null : Number(maxRedemptions),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        toast({ title: "✅ הקופון נשמר", description: `${data.code} — מחיר ${data.final_price} ₪` })
        resetForm()
        await loadCoupons()
      } else {
        toast({ title: "שמירה נכשלה", description: data.error ?? 'שגיאה', variant: "destructive" })
      }
    } catch (e: any) {
      toast({ title: "שגיאה", description: e?.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  async function remove(c: string) {
    if (!confirm(`למחוק את הקופון ${c}?`)) return
    setDeleting(c)
    try {
      const res = await fetch(`/api/admin/coupons?code=${encodeURIComponent(c)}`, { method: 'DELETE' })
      if (res.ok) { toast({ title: "הקופון נמחק" }); await loadCoupons() }
      else { const d = await res.json().catch(() => ({})); toast({ title: "מחיקה נכשלה", description: d.error, variant: "destructive" }) }
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div dir="rtl" className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-2">
        <Tag className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">ניהול קופונים</h1>
      </div>

      {/* ── Form ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">הוספה / עריכת קופון</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Code */}
            <div className="space-y-1.5">
              <Label>שם הקופון / קוד</Label>
              <div className="flex gap-2">
                <Input
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  placeholder="WELCOME25"
                  className="flex-1 font-mono"
                />
                <Button type="button" variant="outline" onClick={() => setCode(genCode())} title="צור קוד">
                  <Sparkles className="h-4 w-4 ml-1" /> צור קוד
                </Button>
              </div>
            </div>

            {/* Type */}
            <div className="space-y-1.5">
              <Label>סוג הנחה</Label>
              <Select value={discountType} onValueChange={v => setDiscountType(v as DiscountType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">אחוז הנחה (%)</SelectItem>
                  <SelectItem value="fixed">הנחה בש"ח (₪)</SelectItem>
                  <SelectItem value="free">חינם</SelectItem>
                  <SelectItem value="grace">חודשים חינם (Grace)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Value */}
            {discountType !== 'free' && (
              <div className="space-y-1.5">
                <Label>
                  {discountType === 'percent' ? 'אחוז הנחה (0-100)'
                    : discountType === 'fixed' ? 'הנחה בש"ח'
                    : 'מספר חודשים חינם'}
                </Label>
                <Input
                  type="number"
                  value={discountValue}
                  onChange={e => setDiscountValue(e.target.value)}
                  placeholder={discountType === 'percent' ? '25' : discountType === 'grace' ? '2' : '20'}
                />
              </div>
            )}

            {/* Scope */}
            <div className="space-y-1.5">
              <Label>תחולה</Label>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="first_payment">תשלום ראשון בלבד</SelectItem>
                  <SelectItem value="recurring">חוזר (כל חודש)</SelectItem>
                  <SelectItem value="forever">לתמיד</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Expiry */}
            <div className="space-y-1.5">
              <Label>תוקף (אופציונלי)</Label>
              <Input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
            </div>

            {/* Max redemptions */}
            <div className="space-y-1.5">
              <Label>מקסימום מימושים (ריק = ללא הגבלה)</Label>
              <Input type="number" value={maxRedemptions} onChange={e => setMaxRedemptions(e.target.value)} placeholder="∞" />
            </div>
          </div>

          {/* Payment URL — only for paid coupons */}
          {isPaid && (
            <div className="space-y-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <Label className="flex items-center justify-between">
                <span>קישור לדף התשלום (Upay)</span>
                <Badge variant="outline">מחיר קופון זה: {computedPrice} ₪</Badge>
              </Label>
              <Input
                value={paymentUrl}
                onChange={e => setPaymentUrl(e.target.value)}
                placeholder="https://app.upay.co.il/API6/s.php?m=..."
                dir="ltr"
                className="font-mono text-sm"
              />
              <p className="flex items-start gap-1.5 text-xs text-amber-600">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                ודא שהקישור ב-Upay גובה בדיוק סכום זה — אחרת הלקוח יראה מחיר אחד וישלם אחר.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch checked={active} onCheckedChange={setActive} id="active" />
              <Label htmlFor="active">פעיל</Label>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={resetForm}>נקה</Button>
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Plus className="h-4 w-4 ml-1" />}
                שמור קופון
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Table ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">קופונים קיימים</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : coupons.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">אין קופונים עדיין</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">קוד</TableHead>
                    <TableHead className="text-right">סוג</TableHead>
                    <TableHead className="text-right">ערך</TableHead>
                    <TableHead className="text-right">מחיר</TableHead>
                    <TableHead className="text-right">מומש</TableHead>
                    <TableHead className="text-right">פעיל</TableHead>
                    <TableHead className="text-right">תוקף</TableHead>
                    <TableHead className="text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coupons.map(c => (
                    <TableRow key={c.code} className="cursor-pointer" onClick={() => editCoupon(c)}>
                      <TableCell className="font-mono font-semibold">{c.code}</TableCell>
                      <TableCell>{TYPE_LABELS[c.discount_type]}</TableCell>
                      <TableCell>
                        {c.discount_type === 'free' ? '—'
                          : c.discount_type === 'percent' ? `${c.discount_value}%`
                          : c.discount_type === 'grace' ? `${c.discount_value} ח׳`
                          : `${c.discount_value} ₪`}
                      </TableCell>
                      <TableCell>{c.final_price} ₪</TableCell>
                      <TableCell>
                        {c.times_redeemed}{c.max_redemptions != null ? ` / ${c.max_redemptions}` : ''}
                      </TableCell>
                      <TableCell>
                        {c.active
                          ? <Badge className="bg-green-500/15 text-green-600">פעיל</Badge>
                          : <Badge variant="outline">כבוי</Badge>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.expires_at ? new Date(c.expires_at).toLocaleDateString('he-IL') : '—'}
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <Button size="sm" variant="ghost" onClick={() => remove(c.code)} disabled={deleting === c.code}>
                          {deleting === c.code
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Trash2 className="h-3.5 w-3.5 text-red-500" />}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Redemption detail */}
          {coupons.some(c => c.redemptions.length > 0) && (
            <div className="mt-4 space-y-1 text-xs text-muted-foreground">
              <p className="font-medium">מימושים:</p>
              {coupons.filter(c => c.redemptions.length > 0).map(c => (
                <div key={c.code}>
                  <span className="font-mono font-semibold">{c.code}</span>: {c.redemptions.length} —{' '}
                  {c.redemptions.map(r => `${r.user_id.slice(0, 8)} (${new Date(r.redeemed_at).toLocaleDateString('he-IL')})`).join(', ')}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
