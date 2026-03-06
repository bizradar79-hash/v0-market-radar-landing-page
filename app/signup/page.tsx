'use client'

/**
 * OTP Email Template for Supabase (set in dashboard):
 * 
 * Go to: Supabase Dashboard → Authentication → Email Templates → Confirm signup
 * 
 * Subject: אימות חשבון - Market Radar Israel
 * Body:
 * קוד האימות שלך הוא: {{ .Token }}
 * הקוד תקף ל-10 דקות.
 */

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useRef } from 'react'
import { Radar, Loader2, Mail, KeyRound } from 'lucide-react'

type Step = 'signup' | 'otp'

export default function SignupPage() {
  const [step, setStep] = useState<Step>('signup')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', ''])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const router = useRouter()
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            company_name: companyName,
          },
        },
      })
      if (error) throw error
      // Move to OTP step on same page
      setStep('otp')
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'אירעה שגיאה, נסה שוב')
    } finally {
      setIsLoading(false)
    }
  }

  const handleOtpChange = (index: number, value: string) => {
    // Only allow digits
    if (value && !/^\d$/.test(value)) return
    
    const newOtp = [...otpCode]
    newOtp[index] = value
    setOtpCode(newOtp)
    
    // Auto-focus next input
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus()
    }
  }

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    // Handle backspace to go to previous input
    if (e.key === 'Backspace' && !otpCode[index] && index > 0) {
      otpRefs.current[index - 1]?.focus()
    }
  }

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pastedData.length === 6) {
      setOtpCode(pastedData.split(''))
      otpRefs.current[5]?.focus()
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    const code = otpCode.join('')
    if (code.length !== 6) {
      setError('יש להזין קוד בן 6 ספרות')
      setIsLoading(false)
      return
    }

    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: 'signup',
      })
      if (error) throw error
      // Success - redirect to onboarding
      router.push('/onboarding')
    } catch (error: unknown) {
      setError('קוד שגוי, נסה שנית')
      // Clear OTP inputs on error
      setOtpCode(['', '', '', '', '', ''])
      otpRefs.current[0]?.focus()
    } finally {
      setIsLoading(false)
    }
  }

  const handleResendCode = async () => {
    const supabase = createClient()
    setIsResending(true)
    setError(null)

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
      })
      if (error) throw error
      // Clear OTP and show success message briefly
      setOtpCode(['', '', '', '', '', ''])
      otpRefs.current[0]?.focus()
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'שגיאה בשליחת קוד חדש')
    } finally {
      setIsResending(false)
    }
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-background p-6 md:p-10" dir="rtl">
      {/* Background gradient effects */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 top-0 h-[500px] w-[500px] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -right-40 bottom-0 h-[500px] w-[500px] rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <Radar className="h-6 w-6 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold text-foreground">Market Radar</span>
        </div>

        {step === 'otp' ? (
          /* Step 2: OTP Verification */
          <Card className="border-border bg-card/80 backdrop-blur-sm">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <KeyRound className="h-8 w-8 text-primary" />
              </div>
              <CardTitle className="text-2xl font-bold text-foreground">אימות המייל שלך</CardTitle>
              <CardDescription className="text-muted-foreground">
                שלחנו קוד בן 6 ספרות לכתובת
                <br />
                <span className="font-medium text-foreground" dir="ltr">{email}</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleVerifyOtp}>
                <div className="flex flex-col gap-6">
                  {/* 6-digit OTP input */}
                  <div className="flex justify-center gap-2" dir="ltr">
                    {otpCode.map((digit, index) => (
                      <Input
                        key={index}
                        ref={el => { otpRefs.current[index] = el }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpChange(index, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(index, e)}
                        onPaste={index === 0 ? handleOtpPaste : undefined}
                        className="h-14 w-12 text-center text-2xl font-bold border-border bg-input text-foreground focus:border-primary focus:ring-primary"
                        autoFocus={index === 0}
                      />
                    ))}
                  </div>

                  {error && (
                    <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive text-center">
                      {error}
                    </div>
                  )}

                  <Button 
                    type="submit" 
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90" 
                    disabled={isLoading || otpCode.join('').length !== 6}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                        מאמת...
                      </>
                    ) : (
                      'אמת קוד'
                    )}
                  </Button>

                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={isResending}
                    className="text-sm text-primary hover:underline disabled:opacity-50"
                  >
                    {isResending ? 'שולח...' : 'שלח קוד מחדש'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setStep('signup')
                      setError(null)
                      setOtpCode(['', '', '', '', '', ''])
                    }}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    חזור לטופס ההרשמה
                  </button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : (
          /* Step 1: Signup Form */
          <Card className="border-border bg-card/80 backdrop-blur-sm">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-bold text-foreground">צור חשבון חדש</CardTitle>
              <CardDescription className="text-muted-foreground">
                הצטרף ל-Market Radar והתחל לקבל מודיעין עסקי
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSignUp}>
                <div className="flex flex-col gap-5">
                  <div className="grid gap-2">
                    <Label htmlFor="fullName" className="text-foreground">שם מלא</Label>
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="השם המלא שלך"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="border-border bg-input text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="company" className="text-foreground">שם החברה</Label>
                    <Input
                      id="company"
                      type="text"
                      placeholder="שם החברה שלך"
                      required
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="border-border bg-input text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="email" className="text-foreground">אימייל</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="your@email.com"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="border-border bg-input text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary"
                      dir="ltr"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="password" className="text-foreground">סיסמה</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="לפחות 6 תווים"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="border-border bg-input text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary"
                      dir="ltr"
                    />
                  </div>
                  {error && (
                    <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                      {error}
                    </div>
                  )}
                  <Button 
                    type="submit" 
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90" 
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                        יוצר חשבון...
                      </>
                    ) : (
                      'צור חשבון'
                    )}
                  </Button>
                </div>
                <div className="mt-6 text-center text-sm text-muted-foreground">
                  כבר יש לך חשבון?{' '}
                  <Link
                    href="/login"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    התחבר
                  </Link>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {step === 'signup' && (
          <p className="mt-6 text-center text-xs text-muted-foreground">
            בלחיצה על &quot;צור חשבון&quot; אתה מסכים ל
            <Link href="#" className="text-primary hover:underline">תנאי השימוש</Link>
            {' '}ול
            <Link href="#" className="text-primary hover:underline">מדיניות הפרטיות</Link>
          </p>
        )}
      </div>
    </div>
  )
}
