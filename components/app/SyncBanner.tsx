"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Loader2 } from "lucide-react"

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })
}

export default function SyncBanner() {
  const [status, setStatus] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [nextSync, setNextSync] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('companies')
        .select('sync_status, last_sync_at, next_sync_at')
        .eq('id', user.id)
        .single()
      if (!data) return
      setStatus(data.sync_status || null)
      setLastSync(data.last_sync_at || null)
      setNextSync(data.next_sync_at || null)

      // Poll while running
      if (data.sync_status === 'running') {
        if (!interval) interval = setInterval(load, 8000)
      } else {
        clearInterval(interval)
      }
    }

    load()
    return () => clearInterval(interval)
  }, []) // eslint-disable-line

  if (status !== 'running' && !lastSync) return null

  if (status === 'running') {
    return (
      <div className="flex items-center gap-2 bg-blue-50 border-b border-blue-100 px-4 py-2 text-sm text-blue-700">
        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
        המערכת מעדכנת נתונים... זה עשוי לקחת כמה דקות
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 bg-muted/40 border-b border-border px-4 py-1.5 text-xs text-muted-foreground">
      {lastSync && <span>עודכן לאחרונה: {formatDate(lastSync)}</span>}
      {nextSync && <span>· עדכון הבא: {formatDate(nextSync)}</span>}
    </div>
  )
}
