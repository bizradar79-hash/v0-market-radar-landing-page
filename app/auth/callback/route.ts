import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const origin = requestUrl.origin
  
  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && data.user) {
      // Check if user has completed onboarding by looking for a company record
      // In the new schema, companies.id = auth.uid
      const { data: company } = await supabase
        .from('companies')
        .select('onboarding_completed')
        .eq('id', data.user.id)
        .single()

      // Already onboarded → dashboard.
      if (company?.onboarding_completed) {
        return NextResponse.redirect(new URL('/app/dashboard', origin))
      }

      // Not onboarded yet. Payment step comes BEFORE onboarding: send users
      // who don't already have an active/grace subscription to /checkout.
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('status')
        .eq('user_id', data.user.id)
        .maybeSingle()

      if (sub && (sub.status === 'active' || sub.status === 'grace')) {
        return NextResponse.redirect(new URL('/onboarding', origin))
      }
      return NextResponse.redirect(new URL('/checkout', origin))
    }
  }
  
  // If there's an error or no code, redirect to login with error
  return NextResponse.redirect(new URL('/login?error=auth_callback_error', origin))
}
