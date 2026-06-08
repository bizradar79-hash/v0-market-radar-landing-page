"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { Loader2, CreditCard, CheckCircle2, XCircle, RefreshCw } from "lucide-react"

interface Payment {
  id: string
  user_id: string
  status: string
  final_amount: number | null
  coupon_code: string | null
  created_at: string
  email: string | null
  company_name: string | null
}

interface Activation {
  id: string
  user_id: string
  status: string
  final_amount: number | null
  paid_amount: number | null
  transaction_id: string | null
  provider_confirmation: string | null
  four_digits: string | null
  coupon_code: string | null
  auto_confirmed: boolean | null
  review_flag: string | null
  confirmed_at: string | null
  created_at: string
  email: string | null
  company_name: string | null
}

export default function AdminPaymentsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [payments, setPayments] = useState<Payment[]>([])
  const [activations, setActivations] = useState<Activation[]>([])
  const [acting, setActing] = useState<string | null>(null)

  useEffect(() => { checkAdminAndLoad() }, [])

  async function checkAdminAndLoad() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }
    const { data: role } = await supabase
      .from('user_roles').select('is_admin').eq('user_id', user.id).single()
    if (!role?.is_admin) { router.replace('/app/dashboard'); return }
    await load()
  }

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/payments')
      const data = await res.json().catch(() => ({}))
      setPayments(Array.isArray(data.payments) ? data.payments : [])
      setActivations(Array.isArray(data.activations) ? data.activations : [])
    } finally {
      setLoading(false)
    }
  }

  async function act(p: Payment, action: 'mark_paid' | 'cancel') {
    const label = action === 'mark_paid' ? 'לסמן כשולם' : 'לבטל'
    if (!confirm(`${label} עבור ${p.email || p.user_id}?`)) return
    setActing(p.id)
    try {
      const res = await fetch('/api/admin/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription_id: p.id, action }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        toast({ title: action === 'mark_paid' ? "✅ סומן כשולם" : "בוטל", description: p.email || '' })
        await load()
      } else {
        toast({ title: "הפעולה נכשלה", description: data.error ?? 'שגיאה', variant: "destructive" })
      }
    } catch (e: any) {
      toast({ title: "שגיאה", description: e?.message, variant: "destructive" })
    } finally {
      setActing(null)
    }
  }

  return (
    <div dir="rtl" className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">תשלומים ממתינים</h1>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ml-1 ${loading ? 'animate-spin' : ''}`} /> רענן
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">ממתינים לאישור ידני</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : payments.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">אין תשלומים ממתינים</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">לקוח</TableHead>
                    <TableHead className="text-right">חברה</TableHead>
                    <TableHead className="text-right">קופון</TableHead>
                    <TableHead className="text-right">סכום צפוי</TableHead>
                    <TableHead className="text-right">נוצר</TableHead>
                    <TableHead className="text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm">{p.email || <span className="font-mono text-xs">{p.user_id.slice(0, 8)}</span>}</TableCell>
                      <TableCell className="text-sm">{p.company_name || '—'}</TableCell>
                      <TableCell>
                        {p.coupon_code
                          ? <Badge variant="outline" className="font-mono">{p.coupon_code}</Badge>
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="font-semibold">{p.final_amount ?? 79} ₪</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(p.created_at).toLocaleString('he-IL')}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => act(p, 'mark_paid')}
                            disabled={acting === p.id}
                          >
                            {acting === p.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin ml-1" />
                              : <CheckCircle2 className="h-3.5 w-3.5 ml-1" />}
                            סמן כשולם
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => act(p, 'cancel')}
                            disabled={acting === p.id}
                          >
                            <XCircle className="h-3.5 w-3.5 ml-1" /> בטל
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            אשר תשלומים מול לוח הבקרה של Upay. הפניה ל-/onboarding אינה הוכחת תשלום.
          </p>
        </CardContent>
      </Card>

      {/* Recent activations — reconcile auto-confirmed Upay returns vs dashboard */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">הפעלות אחרונות</CardTitle>
        </CardHeader>
        <CardContent>
          {activations.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">אין הפעלות אחרונות</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">לקוח</TableHead>
                    <TableHead className="text-right">סכום ששולם</TableHead>
                    <TableHead className="text-right">מס׳ עסקה</TableHead>
                    <TableHead className="text-right">קופון</TableHead>
                    <TableHead className="text-right">אישור</TableHead>
                    <TableHead className="text-right">תאריך</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activations.map(a => (
                    <TableRow key={a.id} className={a.review_flag ? 'bg-red-500/5' : undefined}>
                      <TableCell className="text-sm">{a.email || <span className="font-mono text-xs">{a.user_id.slice(0, 8)}</span>}</TableCell>
                      <TableCell className="font-semibold">
                        {a.paid_amount ?? a.final_amount ?? '—'} ₪
                        {a.review_flag === 'amount_mismatch' && (
                          <Badge variant="destructive" className="mr-2">אי-התאמת סכום</Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {a.transaction_id || '—'}
                        {a.four_digits && <span className="text-muted-foreground"> ···{a.four_digits}</span>}
                      </TableCell>
                      <TableCell>
                        {a.coupon_code
                          ? <Badge variant="outline" className="font-mono">{a.coupon_code}</Badge>
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        {a.auto_confirmed
                          ? <Badge variant="secondary">אוטומטי</Badge>
                          : <Badge variant="outline">ידני</Badge>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(a.confirmed_at || a.created_at).toLocaleString('he-IL')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            הפעלות &quot;אוטומטי&quot; אושרו לפי פרמטרי החזרה של Upay (זמני) — יש להצליב מול לוח הבקרה.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
