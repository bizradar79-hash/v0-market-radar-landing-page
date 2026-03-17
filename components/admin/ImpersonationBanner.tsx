'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ShieldAlert, Loader2 } from 'lucide-react'

export default function ImpersonationBanner() {
  const [active, setActive] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [returning, setReturning] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (sessionStorage.getItem('is_impersonating') !== 'true') return
    setActive(true)
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setUserEmail(user.email)
    })
  }, [])

  if (!active) return null

  async function handleReturn() {
    setReturning(true)
    const accessToken = sessionStorage.getItem('admin_access_token')
    const refreshToken = sessionStorage.getItem('admin_refresh_token')
    if (accessToken && refreshToken) {
      await createClient().auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      sessionStorage.removeItem('admin_access_token')
      sessionStorage.removeItem('admin_refresh_token')
      sessionStorage.removeItem('is_impersonating')
      sessionStorage.removeItem('admin_email')
      router.push('/app/admin/impersonate')
    }
    setReturning(false)
  }

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between px-4 py-2 bg-amber-400 text-amber-950 text-sm font-medium shadow-md"
      dir="rtl"
    >
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        <span>
          👁 מצב התחזות — מחובר כ:{' '}
          <span className="font-bold font-mono">{userEmail || '...'}</span>
        </span>
      </div>
      <button
        onClick={handleReturn}
        disabled={returning}
        className="flex items-center gap-1.5 rounded-md border border-amber-700/40 bg-amber-300 hover:bg-amber-500 px-3 py-1 text-xs font-semibold text-amber-950 transition-colors disabled:opacity-60"
      >
        {returning && <Loader2 className="h-3 w-3 animate-spin" />}
        חזור לאדמין ←
      </button>
    </div>
  )
}
