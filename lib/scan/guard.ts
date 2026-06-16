// Protection against re-scans overwriting good data with empty/degraded results.

export interface GuardResult {
  useNew: boolean
  reason: 'empty' | 'degraded' | null
}

/**
 * Decide whether a freshly-scanned result should replace the stored one.
 * - empty:    we had data, the new scan returned nothing → keep existing.
 * - degraded: the new scan returned less than half of what we had → keep existing.
 * Otherwise the new result wins.
 *
 * Pass { noReduce: true } for modules that must NEVER shrink (e.g. competitor
 * discovery, which is additive): the write is rejected whenever newCount is at
 * all smaller than existingCount, not just below half. Default behavior is
 * unchanged for all other callers.
 */
export function guardWrite(existingCount: number, newCount: number, opts?: { noReduce?: boolean }): GuardResult {
  if (existingCount > 0 && newCount === 0) return { useNew: false, reason: 'empty' }
  if (opts?.noReduce) {
    if (existingCount > 0 && newCount < existingCount) return { useNew: false, reason: 'degraded' }
    return { useNew: true, reason: null }
  }
  if (existingCount > 0 && newCount < existingCount * 0.5) return { useNew: false, reason: 'degraded' }
  return { useNew: true, reason: null }
}

/**
 * Append a 'kept_existing' audit entry to companies.sync_log. Best-effort —
 * never throws. Modules are run sequentially by the orchestrators, so the
 * read-modify-write is safe within a single scan run.
 */
export async function logKeptExisting(
  supabase: any,
  companyId: string,
  entry: { module: string; reason: 'empty' | 'degraded' | null; existing_count: number; new_count: number },
): Promise<void> {
  try {
    const { data } = await supabase.from('companies').select('sync_log').eq('id', companyId).single()
    const log = Array.isArray(data?.sync_log) ? data.sync_log : []
    log.push({
      module: entry.module,
      status: 'kept_existing',
      reason: entry.reason,
      existing_count: entry.existing_count,
      new_count: entry.new_count,
      updated_at: new Date().toISOString(),
    })
    await supabase.from('companies').update({ sync_log: log }).eq('id', companyId)
  } catch {
    /* best-effort logging */
  }
}
