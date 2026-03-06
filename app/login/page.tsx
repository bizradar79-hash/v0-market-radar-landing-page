'use client'

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
import { useState } from 'react'
import { Radar, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    try {
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw error
      
      // Check if user has completed onboarding
      if (authData.user) {
        const { data: company } = await supabase
          .from('companies')
          .select('onboarding_completed')
          .eq('id', authData.user.id)
          .single()
        
        // If no company or onboarding not completed, redirect to onboarding
        if (!company || !company.onboarding_completed) {
          router.push('/onboarding')
          return
        }
      }
      
      router.push('/app/dashboard')
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'אימייל או סיסמה שגויים')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-background p-6 md:p-10">
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

        <Card className="border-border bg-card/80 backdrop-blur-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold text-foreground">ברוך הבא</CardTitle>
            <CardDescription className="text-muted-foreground">
              התחבר לחשבון שלך כדי להמשיך
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin}>
              <div className="flex flex-col gap-5">
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
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-foreground">סיסמה</Label>
                    <Link
                      href="/forgot-password"
                      className="text-sm text-primary hover:underline"
                    >
                      שכחת סיסמה?
                    </Link>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    placeholder="הסיסמה שלך"
                    required
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
                      מתחבר...
                    </>
                  ) : (
                    'התחבר'
                  )}
                </Button>
              </div>
              <div className="mt-6 text-center text-sm text-muted-foreground">
                אין לך חשבון?{' '}
                <Link
                  href="/signup"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  צור חשבון
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
