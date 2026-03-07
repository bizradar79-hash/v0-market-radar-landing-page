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
      
      // If no company or onboarding not completed, go to onboarding
      if (!company || !company.onboarding_completed) {
        return NextResponse.redirect(new URL('/onboarding', origin))
      }
      
      // Otherwise go to dashboard
      return NextResponse.redirect(new URL('/app/dashboard', origin))
    }
  }
  
  // If there's an error or no code, redirect to login with error
  return NextResponse.redirect(new URL('/login?error=auth_callback_error', origin))
}
