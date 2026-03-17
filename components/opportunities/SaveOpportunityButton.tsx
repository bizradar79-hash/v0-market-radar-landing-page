'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useSavedOpportunities } from '@/hooks/useSavedOpportunities'
import type { SourceType, SavedOpportunity } from '@/types/saved-opportunity'

interface Props {
  sourceType: SourceType
  sourceId: string
  data: Omit<SavedOpportunity, 'id' | 'company_id' | 'source_type' | 'source_id' | 'status' | 'saved_at' | 'last_ai_update' | 'user_notes'>
  size?: 'sm' | 'default'
}

export default function SaveOpportunityButton({ sourceType, sourceId, data, size = 'sm' }: Props) {
  const { saveOpportunity, isSaved, isLoading: hookLoading } = useSavedOpportunities()
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const saved = isSaved(sourceType, sourceId)
  const px = size === 'default' ? 'px-3 py-1.5' : 'px-2 py-1'

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (saved || saving || hookLoading) return
    setSaving(true)
    try {
      const result = await saveOpportunity({
        source_type: sourceType,
        source_id: sourceId,
        ...data,
      })
      if (result === 'saved') {
        toast({ title: 'נשמר במרכז ההזדמנויות ⭐' })
      } else if (result === 'already_saved') {
        toast({ title: 'כבר שמור במרכז ההזדמנויות' })
      } else {
        toast({ title: 'שגיאה בשמירה', variant: 'destructive' })
      }
    } finally {
      setSaving(false)
    }
  }

  if (saved) {
    return (
      <span className={`inline-flex items-center text-xs ${px} rounded border border-green-300 text-green-600 bg-green-50 select-none`}>
        ✓ נשמר
      </span>
    )
  }

  return (
    <button
      onClick={handleClick}
      disabled={saving || hookLoading}
      className={`inline-flex items-center gap-1 text-xs ${px} rounded border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors disabled:opacity-50`}
    >
      {saving ? (
        <><Loader2 className="h-3 w-3 animate-spin" />שומר...</>
      ) : (
        '⭐ שמור להזדמנויות'
      )}
    </button>
  )
}
