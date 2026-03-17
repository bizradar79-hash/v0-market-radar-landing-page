'use client'

import { useState, useEffect, useCallback, useReducer } from 'react'
import type { SourceType } from '@/types/saved-opportunity'

// ── Module-level singleton — shared across all hook instances on the page ──
// Prevents N buttons each making their own GET request on mount.

let _savedIds: Set<string> = new Set()
let _loaded = false
let _loadPromise: Promise<void> | null = null
const _listeners: Set<() => void> = new Set()

function notifyListeners() {
  _listeners.forEach(fn => fn())
}

function ensureLoaded(): Promise<void> {
  if (_loaded) return Promise.resolve()
  if (_loadPromise) return _loadPromise
  _loadPromise = fetch('/api/saved-opportunities')
    .then(r => r.json())
    .then(json => {
      if (json.opportunities) {
        _savedIds = new Set(
          json.opportunities.map((o: any) => `${o.source_type}:${o.source_id}`)
        )
      }
      _loaded = true
      notifyListeners()
    })
    .catch(() => {
      _loaded = true // don't block UI on error
    })
    .finally(() => { _loadPromise = null })
  return _loadPromise
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useSavedOpportunities() {
  const [, forceUpdate] = useReducer(x => x + 1, 0)
  const [isLoading, setIsLoading] = useState(!_loaded)

  useEffect(() => {
    if (_loaded) {
      setIsLoading(false)
      return
    }
    const notify = () => { setIsLoading(false); forceUpdate() }
    _listeners.add(notify)
    ensureLoaded()
    return () => { _listeners.delete(notify) }
  }, [])

  const saveOpportunity = useCallback(async (data: {
    source_type: SourceType
    source_id: string
    title: string
    summary?: string
    description?: string
    revenue_potential_score?: number
    estimated_revenue_min?: number
    estimated_revenue_max?: number
    confidence_score?: number
    market_region?: string
    industry_tag?: string
  }): Promise<'saved' | 'already_saved' | 'error'> => {
    try {
      const res = await fetch('/api/saved-opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) return 'error'

      const key = `${data.source_type}:${data.source_id}`
      _savedIds = new Set([..._savedIds, key])
      notifyListeners()
      forceUpdate()

      return json.already_saved ? 'already_saved' : 'saved'
    } catch {
      return 'error'
    }
  }, [])

  const isSaved = useCallback((source_type: SourceType, source_id: string): boolean => {
    return _savedIds.has(`${source_type}:${source_id}`)
  }, [])

  return { saveOpportunity, isSaved, isLoading }
}
