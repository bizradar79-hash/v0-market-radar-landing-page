import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

const TEST_EMAIL = 'test@marketradar.co.il'
const TEST_PASSWORD = 'Test123456!'

export async function GET() {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  )
  const { data: { session }, error } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  })
  if (!session) {
    return NextResponse.json({ error: error?.message || 'Sign in failed' }, { status: 401 })
  }
  return NextResponse.json({ token: session.access_token, userId: session.user.id })
}
