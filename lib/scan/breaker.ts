/**
 * FIX 3 — Scan circuit breaker.
 *
 * One JSONB column (`companies.scan_control`) is the single source of truth for
 * a scan's lifecycle. The orchestrator (and any module that wants to be a good
 * citizen) consults it so a run can never:
 *   • exceed SCAN_MAX_CALLS external-AI-call units  → abort 'aborted_call_cap'
 *   • exceed SCAN_MAX_SECONDS wall-clock seconds     → abort 'aborted_timeout'
 *   • keep going after a user pressed "עצור סריקה"   → abort 'stopped'
 *
 * The orchestrator is the only writer of `call_count` (it dispatches modules
 * sequentially) so the read-modify-write counter is race-free in practice.
 * Modules only ever READ the status to honour a stop signal. Every helper is
 * graceful if the column is missing, so deploying the code before running the
 * migration can't crash a scan.
 */

export type ScanStatus = 'running' | 'done' | 'stopped' | 'error'
export type ModuleStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error'
export type ScanProfile = 'initial' | 'weekly'

export interface ScanModuleState {
  status: ModuleStatus
  message?: string
  updated_at: string
}

export interface ScanControl {
  status: ScanStatus
  profile: ScanProfile
  started_at: string
  finished_at?: string | null
  call_count: number
  max_calls: number
  max_seconds: number
  abort_reason?: string | null
  modules: Record<string, ScanModuleState>
}

export const SCAN_MAX_CALLS = Math.max(1, parseInt(process.env.SCAN_MAX_CALLS || '12', 10) || 12)
// Initial scans legitimately touch ~14 modules; give them more headroom while
// still bounding runaways. Weekly stays on the tight default.
export const SCAN_MAX_CALLS_INITIAL = Math.max(
  SCAN_MAX_CALLS,
  parseInt(process.env.SCAN_MAX_CALLS_INITIAL || '40', 10) || 40,
)
export const SCAN_MAX_SECONDS = Math.max(30, parseInt(process.env.SCAN_MAX_SECONDS || '240', 10) || 240)

/** Thrown when a scan must abort. The orchestrator catches it and stops cleanly. */
export class ScanAbortError extends Error {
  reason: string
  status: ScanStatus
  constructor(reason: string, status: ScanStatus = 'error') {
    super(`scan aborted: ${reason}`)
    this.name = 'ScanAbortError'
    this.reason = reason
    this.status = status
  }
}

const now = () => new Date().toISOString()

/** Read the current control blob, or null if absent / column missing. */
export async function readScanControl(db: any, companyId: string): Promise<ScanControl | null> {
  try {
    const { data } = await db.from('companies').select('scan_control').eq('id', companyId).single()
    return (data?.scan_control as ScanControl) ?? null
  } catch {
    return null
  }
}

async function writeScanControl(db: any, companyId: string, control: ScanControl): Promise<void> {
  try {
    await db.from('companies').update({ scan_control: control } as any).eq('id', companyId)
  } catch (e: any) {
    console.error('[breaker] writeScanControl failed:', e?.message)
  }
}

/**
 * Begin a scan. Returns the fresh control. If a scan is already 'running' and
 * still fresh (within max_seconds), throws ScanAbortError('already_running') —
 * this is the cross-invocation guard that stops 504 retries (which re-POST with
 * force:true) from stacking duplicate runs. `force` is intentionally NOT allowed
 * to override a *fresh* running scan; only a STALE (timed-out) run is restartable.
 * To restart a fresh-but-stuck scan, the operator presses "stop" first.
 */
export async function initScanControl(
  db: any,
  companyId: string,
  profile: ScanProfile,
  moduleIds: string[],
  opts: { force?: boolean; resume?: boolean } = {},
): Promise<ScanControl> {
  const existing = await readScanControl(db, companyId)
  // Resumability (FIX 1): when restarting a STALE timed-out run, carry over the
  // module flags that already completed so the new run skips them instead of
  // redoing everything. A FRESH running scan still blocks (cross-invocation
  // guard) regardless of `force`.
  //
  // Chaining (TIME fix): a self-chained continuation passes resume:true. It is
  // ALLOWED to take over a fresh running scan (it IS that scan, continuing in a
  // new invocation), carries over completed modules AND the cumulative
  // call_count (so SCAN_MAX_CALLS still bounds the whole multi-window scan),
  // and opens a fresh wall-clock window (started_at = now).
  const carried: Record<string, ScanModuleState> = {}
  let carriedCalls = 0
  if (existing?.status === 'running') {
    const ageMs = Date.now() - new Date(existing.started_at).getTime()
    const fresh = ageMs < existing.max_seconds * 1000
    if (fresh && !opts.resume) {
      throw new ScanAbortError('already_running', 'running')
    }
    for (const [id, st] of Object.entries(existing.modules || {})) {
      if (st?.status === 'done' || st?.status === 'skipped') carried[id] = st
    }
    if (opts.resume) carriedCalls = existing.call_count || 0
  }

  const maxCalls = profile === 'initial' ? SCAN_MAX_CALLS_INITIAL : SCAN_MAX_CALLS
  const modules: Record<string, ScanModuleState> = {}
  for (const id of moduleIds) modules[id] = carried[id] ?? { status: 'pending', updated_at: now() }

  const control: ScanControl = {
    status: 'running',
    profile,
    started_at: now(),
    finished_at: null,
    call_count: carriedCalls,
    max_calls: maxCalls,
    max_seconds: SCAN_MAX_SECONDS,
    abort_reason: null,
    modules,
  }
  await writeScanControl(db, companyId, control)
  return control
}

/**
 * Assert the scan may continue. Throws ScanAbortError on stop/timeout, marking
 * the control accordingly. Call this BEFORE each module / AI call.
 */
export async function assertScanAlive(db: any, companyId: string): Promise<ScanControl | null> {
  const control = await readScanControl(db, companyId)
  if (!control) return null // column missing — degrade open, don't crash

  if (control.status === 'stopped') {
    throw new ScanAbortError('stopped', 'stopped')
  }
  const ageMs = Date.now() - new Date(control.started_at).getTime()
  if (ageMs > control.max_seconds * 1000) {
    control.status = 'error'
    control.abort_reason = 'aborted_timeout'
    control.finished_at = now()
    await writeScanControl(db, companyId, control)
    throw new ScanAbortError('aborted_timeout', 'error')
  }
  return control
}

/**
 * Record `n` external-AI-call units and enforce the call cap. Throws
 * ScanAbortError('aborted_call_cap') when exceeded.
 */
export async function recordScanCall(db: any, companyId: string, n = 1): Promise<number> {
  const control = await readScanControl(db, companyId)
  if (!control) return 0
  control.call_count = (control.call_count || 0) + n
  if (control.call_count > control.max_calls) {
    control.status = 'error'
    control.abort_reason = 'aborted_call_cap'
    control.finished_at = now()
    await writeScanControl(db, companyId, control)
    throw new ScanAbortError('aborted_call_cap', 'error')
  }
  await writeScanControl(db, companyId, control)
  return control.call_count
}

/** Update a single module's status row (best-effort). */
export async function setModuleStatus(
  db: any,
  companyId: string,
  moduleId: string,
  status: ModuleStatus,
  message?: string,
): Promise<void> {
  const control = await readScanControl(db, companyId)
  if (!control) return
  control.modules = control.modules || {}
  control.modules[moduleId] = { status, message, updated_at: now() }
  await writeScanControl(db, companyId, control)
}

/** Finalise the scan. Skips clobbering a terminal abort state. */
export async function finishScan(db: any, companyId: string, status: ScanStatus): Promise<void> {
  const control = await readScanControl(db, companyId)
  if (!control) return
  // Don't overwrite an abort/stop that already won the race.
  if (control.status === 'stopped' || (control.status === 'error' && control.abort_reason)) {
    control.finished_at = control.finished_at || now()
    await writeScanControl(db, companyId, control)
    return
  }
  control.status = status
  control.finished_at = now()
  await writeScanControl(db, companyId, control)
}

/** User pressed "עצור סריקה". Sets status='stopped' so the next check aborts. */
export async function stopScan(db: any, companyId: string): Promise<ScanControl | null> {
  const control = await readScanControl(db, companyId)
  if (!control) {
    // No active control — still record an explicit stopped marker so the UI
    // reflects the request even if the column was just added.
    const stub: ScanControl = {
      status: 'stopped', profile: 'weekly', started_at: now(), finished_at: now(),
      call_count: 0, max_calls: SCAN_MAX_CALLS, max_seconds: SCAN_MAX_SECONDS,
      abort_reason: 'stopped', modules: {},
    }
    await writeScanControl(db, companyId, stub)
    return stub
  }
  control.status = 'stopped'
  control.abort_reason = 'stopped'
  control.finished_at = now()
  await writeScanControl(db, companyId, control)
  return control
}
